#!/usr/bin/env python3
"""Build the Cabinet snapshot for the first historical autonomous-project cohort."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))

import cabinet  # noqa: E402


def load_names(manifest: Path) -> list[str]:
    names = []
    for raw in manifest.read_text(encoding="utf-8").splitlines():
        name = raw.strip()
        if not name or name.startswith("#"):
            continue
        if name in {".", ".."} or "/" in name or "\\" in name:
            raise ValueError(f"invalid project name in manifest: {name}")
        names.append(name)
    if not names:
        raise ValueError("historical cohort manifest is empty")
    return names


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--projects-root", default="/home/mojo/autonomous-projects")
    parser.add_argument("--manifest", default=str(PROJECT / "datasets" / "first-autonomous-cohort.txt"))
    parser.add_argument("--output", required=True)
    parser.add_argument("--git-status", action="store_true")
    args = parser.parse_args()

    projects_root = Path(args.projects_root).expanduser().resolve(strict=True)
    names = load_names(Path(args.manifest).expanduser().resolve(strict=True))
    roots = []
    missing = []
    for name in names:
        candidate = projects_root / name
        if not candidate.is_dir() or candidate.is_symlink():
            missing.append(name)
        else:
            roots.append(str(candidate))
    if missing:
        raise ValueError("historical cohort projects missing: " + ", ".join(missing))

    output = cabinet.output_path_is_safe(args.output, roots)
    snapshot = cabinet.scan(roots, args.git_status)
    snapshot["collection"] = {
        "name": "First autonomous-build cohort",
        "period": "June 27–29, 2026",
        "project_count": len(roots),
        "selection": "The earliest Hermes Autonomous Project Builder repositories, before the July iteration series.",
    }
    cabinet.validate_snapshot(snapshot)
    payload = cabinet.canonical_bytes(snapshot)
    cabinet.atomic_write(output, payload)
    print(f"Wrote {output} with {len(roots)} historical autonomous projects ({len(payload)} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
