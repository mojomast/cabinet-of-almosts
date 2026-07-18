import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

import cabinet


class CabinetFixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def project(self, name, files):
        root = self.root / name
        root.mkdir(parents=True)
        for rel, content in files.items():
            path = root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        return root

    def test_deterministic_canonical_snapshot(self):
        self.project("alpha", {"README.md": "# Alpha\n", "a.py": "def useful():\n    return 1\n# TODO improve\n"})
        first = cabinet.canonical_bytes(cabinet.scan([str(self.root)]))
        second = cabinet.canonical_bytes(cabinet.scan([str(self.root)]))
        self.assertEqual(first, second)
        self.assertEqual(first, cabinet.canonical_bytes(json.loads(first)))
        self.assertTrue(first.endswith(b"\n"))
        self.assertNotIn(str(self.root), first.decode("utf-8", "replace"))

    def test_secret_binary_and_special_file_exclusion(self):
        project = self.project("safe", {
            "README.md": "# Safe\n", "main.py": "def visible(): return True\n",
            ".env": "PASSWORD=hunter2\n", "api_token.txt": "never-show\n",
            "private.pem": "-----BEGIN PRIVATE KEY-----\nsecret\n",
            "embedded.txt": "api_key = supersecretvalue\n", "image.bin": "binary-ish",
        })
        fifo = project / "named-pipe"
        if hasattr(os, "mkfifo"):
            os.mkfifo(fifo)
        snap = cabinet.scan([str(project)])
        paths = {f["path"] for f in snap["exhibits"][0]["files"]}
        self.assertIn("main.py", paths)
        for forbidden in [".env", "api_token.txt", "private.pem", "embedded.txt", "image.bin", "named-pipe"]:
            self.assertNotIn(forbidden, paths)
        self.assertNotIn("hunter2", cabinet.canonical_bytes(snap).decode())

    def test_symlink_is_never_followed_and_symlink_root_refused(self):
        project = self.project("inside", {"README.md": "# Inside", "main.py": "def local(): pass\n"})
        outside = self.root / "outside-secret.txt"
        outside.write_text("DO_NOT_INCLUDE")
        (project / "escape.txt").symlink_to(outside)
        outside_dir = self.root / "outside-dir"; outside_dir.mkdir(); (outside_dir / "loot.py").write_text("DO_NOT_INCLUDE")
        (project / "escape-dir").symlink_to(outside_dir, target_is_directory=True)
        data = cabinet.canonical_bytes(cabinet.scan([str(project)])).decode()
        self.assertNotIn("escape.txt", data)
        self.assertNotIn("loot.py", data)
        root_link = self.root / "root-link"; root_link.symlink_to(project, target_is_directory=True)
        with self.assertRaises(ValueError):
            cabinet.scan([str(root_link)])

    def test_excluded_directories(self):
        project = self.project("clean", {"README.md": "# Clean", "src/app.py": "def kept(): return 1\n"})
        for directory in [".git", "node_modules", "vendor", "dist", "build", ".venv", "target", "generated", "__pycache__"]:
            path = project / directory; path.mkdir(); (path / "forbidden.py").write_text("DO_NOT_INCLUDE")
        snap = cabinet.scan([str(project)])
        paths = [f["path"] for f in snap["exhibits"][0]["files"]]
        self.assertFalse(any("forbidden" in path for path in paths))
        self.assertIn("src/app.py", paths)

    def test_scores_have_valid_evidence_links(self):
        project = self.project("almost", {"main.py": "def engine():\n    # TODO finish parser\n    pass\n"})
        exhibit = cabinet.scan([str(project)])["exhibits"][0]
        ids = {item["id"] for item in exhibit["evidence"]}
        self.assertGreater(exhibit["scores"]["unfinishedness"]["value"], 0)
        for score in exhibit["scores"].values():
            for comp in score["components"]:
                self.assertGreater(comp["points"], 0)
                self.assertTrue(comp["evidence_ids"])
                self.assertTrue(set(comp["evidence_ids"]) <= ids)
        for fragment in exhibit["fragments"]:
            self.assertTrue(set(fragment["evidence_ids"]) <= ids)
            self.assertEqual(fragment["line_start"], fragment["line_end"])

    def test_directionality_and_recipe_bounds(self):
        self.project("host", {"README.md": "# Host", "host.py": "# TODO implement widget\n"})
        for number in range(8):
            self.project(f"donor{number}", {
                "README.md": f"# Donor {number}",
                f"lib{number}.py": f"def widget_{number}(): return {number}\n",
                f"extra{number}.py": f"def helper_{number}(): return {number}\n",
                f"third{number}.py": f"class Thing{number}: pass\n",
                f"fourth{number}.py": f"class More{number}: pass\n",
                f"tests/test_{number}.py": "def test_ok(): assert True\n",
            })
        snap = cabinet.scan([str(self.root)])
        self.assertLessEqual(len(snap["resurrection_recipes"]), cabinet.LIMITS["max_recipes"])
        counts = {}
        ids = {e["name"]: e["id"] for e in snap["exhibits"]}
        exhibits = {e["id"]: e for e in snap["exhibits"]}
        for recipe in snap["resurrection_recipes"]:
            counts[recipe["host_exhibit_id"]] = counts.get(recipe["host_exhibit_id"], 0) + 1
            self.assertLessEqual(len(recipe["source_files"]), cabinet.LIMITS["max_source_files_per_recipe"])
            donor_evidence = {item["id"]: item for item in exhibits[recipe["donor_exhibit_id"]]["evidence"]}
            self.assertEqual(recipe["source_files"], [item["path"] for item in recipe["source_file_provenance"]])
            for item in recipe["source_file_provenance"]:
                self.assertTrue(item["evidence_ids"])
                self.assertTrue(all(donor_evidence[ev_id]["path"] == item["path"] for ev_id in item["evidence_ids"]))
        self.assertTrue(all(v <= cabinet.LIMITS["max_recipes_per_host"] for v in counts.values()))
        self.assertTrue(any(a["to_exhibit_id"] == ids["host"] and a["from_exhibit_id"] != ids["host"] for a in snap["affinities"]))
        cabinet.validate_snapshot(snap)

    def test_evidence_is_bounded_and_reports_truncation(self):
        project = self.project("noisy", {
            "README.md": "# Noisy\n",
            "main.py": "\n".join(f"# TODO widget item {n}" for n in range(500)),
        })
        exhibit = cabinet.scan([str(project)])["exhibits"][0]
        self.assertLessEqual(len(exhibit["evidence"]), cabinet.LIMITS["max_evidence_per_exhibit"])
        self.assertTrue(exhibit["truncated"])
        self.assertIn("evidence", exhibit["truncation"]["reasons"])
        self.assertGreater(exhibit["truncation"]["evidence_omitted"], 0)

    def test_unrelated_projects_do_not_create_completion_affinity(self):
        self.project("parser-host", {
            "README.md": "# Parser host\n",
            "parser.py": "# TODO parser tokenizer boundary\n",
        })
        self.project("weather-donor", {
            "README.md": "# Weather donor\n",
            "weather.py": "def forecast_temperature():\n    return 20\n",
        })
        snapshot = cabinet.scan([str(self.root)])
        ids = {item["name"]: item["id"] for item in snapshot["exhibits"]}
        self.assertFalse(any(
            item["to_exhibit_id"] == ids["parser-host"] and item["from_exhibit_id"] == ids["weather-donor"]
            for item in snapshot["affinities"]
        ))

    def test_documentation_only_exhibit_gets_no_source_points(self):
        project = self.project("notes", {"README.md": "# Notes\nA finished narrative.\n"})
        exhibit = cabinet.scan([str(project)])["exhibits"][0]
        names = {item["name"] for item in exhibit["scores"]["reusability"]["components"]}
        self.assertNotIn("recognizable source", names)
        self.assertFalse(any(item["kind"] == "implementation" for item in exhibit["provisions"]))

    def test_snapshot_validation_rejects_bad_schema_and_references(self):
        with self.assertRaisesRegex(ValueError, "unsupported schema"):
            cabinet.validate_snapshot({"schema": "future"})
        project = self.project("valid", {"README.md": "# Valid\n", "main.py": "# TODO widget\ndef widget(): return 1\n"})
        snapshot = cabinet.scan([str(project)])
        cabinet.validate_snapshot(snapshot)
        broken = json.loads(cabinet.canonical_bytes(snapshot))
        broken["exhibits"][0]["scores"]["unfinishedness"]["components"][0]["evidence_ids"] = ["missing"]
        with self.assertRaisesRegex(ValueError, "broken evidence reference"):
            cabinet.validate_snapshot(broken)

    @unittest.skipUnless(os.name == "posix", "arbitrary-byte filenames require POSIX")
    def test_non_utf8_filename_is_canonicalizable(self):
        project = self.project("bytes", {"README.md": "# Bytes\n"})
        raw_path = os.fsencode(project) + b"/widget_\xff.py"
        fd = os.open(raw_path, os.O_WRONLY | os.O_CREAT, 0o600)
        try:
            os.write(fd, b"def widget(): return 1\n")
        finally:
            os.close(fd)
        payload = cabinet.canonical_bytes(cabinet.scan([str(project)]))
        self.assertIn(b"widget_", payload)

    def test_output_path_inside_scanned_root_is_refused(self):
        project = self.project("host", {"README.md": "# Host\n"})
        with self.assertRaisesRegex(ValueError, "outside supplied roots"):
            cabinet.output_path_is_safe(str(project / "cabinet.json"), [str(project)])

    def test_ui_uses_human_labels_instead_of_opaque_ids(self):
        app = (Path(cabinet.__file__).with_name("static") / "app.js").read_text(encoding="utf-8")
        self.assertIn("Historical autonomous build", app)
        self.assertIn("How much unfinished work was found", app)
        for opaque in ("Exhibit ·", "affinity_id", "evidence_ids.join", "evidence.id"):
            self.assertNotIn(opaque, app)

    def test_http_is_loopback_read_only_and_returns_405(self):
        payload = cabinet.canonical_bytes({"schema": "test", "exhibits": []})
        server = cabinet.make_server(payload, 0)
        self.assertEqual(server.server_address[0], "127.0.0.1")
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        base = f"http://127.0.0.1:{server.server_port}"
        try:
            with urllib.request.urlopen(base + "/cabinet.json") as response:
                self.assertEqual(response.read(), payload)
                self.assertEqual(response.status, 200)
            for method in ["POST", "PUT", "PATCH", "DELETE"]:
                request = urllib.request.Request(base + "/cabinet.json", data=b"x", method=method)
                with self.assertRaises(urllib.error.HTTPError) as caught:
                    urllib.request.urlopen(request)
                self.assertEqual(caught.exception.code, 405)
        finally:
            server.shutdown(); server.server_close(); thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
