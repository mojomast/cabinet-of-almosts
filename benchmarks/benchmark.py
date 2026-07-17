#!/usr/bin/env python3
"""Generate a disposable synthetic cabinet and report scan throughput."""
import argparse
import json
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import cabinet


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--projects", type=int, default=25)
    parser.add_argument("--files", type=int, default=80, help="source files per project")
    parser.add_argument("--lines", type=int, default=30)
    args = parser.parse_args()
    if min(args.projects, args.files, args.lines) < 1:
        parser.error("all dimensions must be positive")
    with tempfile.TemporaryDirectory(prefix="cabinet-bench-") as tmp:
        root = Path(tmp)
        line = "def reusable_piece():\n    return 'measured, not executed'\n# TODO: synthetic unfinished edge\n"
        content = (line * ((args.lines + 2) // 3))[: max(1, args.lines) * len(line) // 3]
        expected_files = 0
        expected_bytes = 0
        for p in range(args.projects):
            project = root / f"project-{p:04d}"; project.mkdir()
            readme = f"# Synthetic project {p}\n"
            (project / "README.md").write_text(readme); expected_files += 1; expected_bytes += len(readme.encode())
            src = project / "src"; src.mkdir()
            for f in range(args.files):
                path = src / f"module_{f:05d}.py"; path.write_text(content)
                expected_files += 1; expected_bytes += len(content.encode())
        started = time.perf_counter()
        snapshot = cabinet.scan([str(root)])
        elapsed = time.perf_counter() - started
        observed_files = sum(e["file_count"] for e in snapshot["exhibits"])
        observed_bytes = sum(e["text_bytes"] for e in snapshot["exhibits"])
        report = {
            "projects_requested": args.projects, "files_generated": expected_files,
            "files_observed": observed_files, "bytes_generated": expected_bytes,
            "bytes_observed": observed_bytes, "seconds": round(elapsed, 6),
            "files_per_second": round(observed_files / elapsed, 2),
            "mib_per_second": round(observed_bytes / elapsed / (1024 * 1024), 2),
            "exhibits": len(snapshot["exhibits"]), "recipes": len(snapshot["resurrection_recipes"]),
        }
        print(json.dumps(report, sort_keys=True, indent=2))


if __name__ == "__main__":
    main()
