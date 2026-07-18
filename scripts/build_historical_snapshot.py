#!/usr/bin/env python3
"""Build the Cabinet snapshot from one-commit autonomous GitHub repositories."""
from __future__ import annotations

import argparse
import csv
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))

import cabinet  # noqa: E402

BUILDS_ROOT = Path("/home/mojo/builds")
DEFAULT_MANIFEST = PROJECT / "datasets" / "autonomous-github-one-commit.csv"


def git_output(path: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(path), *args],
        check=True,
        capture_output=True,
        text=True,
        timeout=10,
        env={"PATH": "/usr/bin:/bin", "HOME": "/nonexistent", "GIT_CONFIG_NOSYSTEM": "1", "GIT_TERMINAL_PROMPT": "0"},
    )
    return result.stdout.strip()


def normalized_repo(remote: str) -> str:
    value = remote.strip().removesuffix(".git")
    if value.startswith("git@github.com:"):
        return value.split(":", 1)[1]
    parsed = urlparse(value)
    if parsed.hostname == "github.com":
        return parsed.path.strip("/")
    return ""


def load_manifest(manifest: Path, builds_root: Path) -> list[dict[str, str]]:
    with manifest.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    required = {"project", "github_repo", "github_url", "local_commit_count", "path"}
    if not rows or not required <= set(rows[0]):
        raise ValueError("repository manifest is empty or malformed")

    records: list[dict[str, str]] = []
    seen: set[str] = set()
    for row in rows:
        project = row["project"].strip()
        path = Path(row["path"]).expanduser().resolve(strict=True)
        expected = (builds_root / project).resolve()
        if path != expected or path.parent != builds_root or path.is_symlink():
            raise ValueError(f"project path escapes the autonomous build root: {project}")
        if project in seen:
            raise ValueError(f"duplicate project in repository manifest: {project}")
        if row["local_commit_count"] != "1" or git_output(path, "rev-list", "--count", "HEAD") != "1":
            raise ValueError(f"project is not a one-commit repository: {project}")
        if not (path / ".built").is_file():
            raise ValueError(f"project lacks autonomous-build provenance marker: {project}")
        expected_repo = f"mojomast/{row['github_repo'].strip()}"
        if normalized_repo(git_output(path, "remote", "get-url", "origin")) != expected_repo:
            raise ValueError(f"GitHub remote does not match manifest: {project}")
        if row["github_url"].strip() != f"https://github.com/{expected_repo}":
            raise ValueError(f"GitHub URL does not match repository identity: {project}")
        seen.add(project)
        records.append({key: row[key].strip() for key in required})
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--builds-root", default=str(BUILDS_ROOT))
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    parser.add_argument("--output", required=True)
    parser.add_argument("--git-status", action="store_true")
    args = parser.parse_args()

    builds_root = Path(args.builds_root).expanduser().resolve(strict=True)
    manifest = Path(args.manifest).expanduser().resolve(strict=True)
    records = load_manifest(manifest, builds_root)
    roots = [record["path"] for record in records]
    output = cabinet.output_path_is_safe(args.output, roots)
    snapshot = cabinet.scan(roots, args.git_status)

    by_project = {record["project"]: record for record in records}
    for exhibit in snapshot["exhibits"]:
        project = exhibit["source_root"].split(":", 1)[-1].split("/", 1)[0]
        record = by_project[project]
        exhibit["repository"] = {
            "owner": "mojomast",
            "name": record["github_repo"],
            "url": record["github_url"],
            "commit_count": 1,
        }

    snapshot["collection"] = {
        "name": "Autonomous build-cycle one-commit GitHub repositories",
        "owner": "mojomast",
        "project_count": len(records),
        "commit_count_per_repository": 1,
        "selection": "GitHub-backed direct children of /home/mojo/builds with a .built provenance marker, a matching mojomast GitHub origin, and exactly one local commit.",
        "excluded": "Two-commit autonomous repositories, local builds without GitHub origins, unrelated *ussy repositories, and later project corpora.",
    }
    cabinet.validate_snapshot(snapshot)
    payload = cabinet.canonical_bytes(snapshot)
    cabinet.atomic_write(output, payload)
    print(f"Wrote {output} with {len(records)} one-commit autonomous GitHub repositories ({len(payload)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
