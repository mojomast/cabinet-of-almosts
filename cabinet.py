#!/usr/bin/env python3
"""The Cabinet of Almosts: deterministic, read-only project archaeology."""
from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import re
import stat
import subprocess
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlsplit

VERSION = "0.2.0"
LIMITS = {
    "max_depth": 3,
    "max_exhibits": 500,
    "max_files_per_exhibit": 4000,
    "max_file_bytes": 512 * 1024,
    "max_exhibit_bytes": 16 * 1024 * 1024,
    "max_fragments_per_exhibit": 24,
    "max_evidence_per_file": 32,
    "max_evidence_per_exhibit": 256,
    "max_recipes": 12,
    "max_recipes_per_host": 2,
    "max_source_files_per_recipe": 3,
}
EXCLUDED_DIRS = {
    ".git", ".hg", ".svn", ".idea", ".vscode", "node_modules", "vendor",
    "dist", "build", "coverage", ".coverage", ".cache", "cache", "__pycache__",
    ".pytest_cache", ".mypy_cache", ".ruff_cache", ".tox", ".venv", "venv", "env",
    "target", "out", "tmp", "temp", "logs", "log", ".next", ".nuxt", ".gradle",
    "Pods", "DerivedData", "generated", "gen",
}
SECRET_NAMES = {
    ".env", ".env.local", ".env.production", ".env.development", ".npmrc", ".pypirc",
    ".netrc", "credentials", "credentials.json", "secrets.json", "id_rsa", "id_ed25519",
    "known_hosts", "authorized_keys", "shadow", "passwd",
}
SECRET_PARTS = re.compile(r"(^|[._-])(secret|secrets|credential|credentials|token|tokens|apikey|api_key|private_key|auth)([._-]|$)", re.I)
SECRET_EXTENSIONS = {".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".sqlite", ".sqlite3", ".db", ".log"}
BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".zip", ".gz", ".bz2",
    ".xz", ".7z", ".tar", ".rar", ".exe", ".dll", ".so", ".dylib", ".o", ".a",
    ".class", ".jar", ".pyc", ".wasm", ".mp3", ".mp4", ".mov", ".avi", ".woff",
    ".woff2", ".ttf", ".eot", ".bin", ".dat", ".lock",
}
PROJECT_MARKERS = {
    "pyproject.toml", "setup.py", "package.json", "Cargo.toml", "go.mod", "Gemfile",
    "pom.xml", "build.gradle", "Makefile", "README", "README.md", "README.rst",
}
TODO_RE = re.compile(r"\b(TODO|FIXME|HACK|XXX|WIP|NOT IMPLEMENTED|pass\s*(?:#.*)?$|NotImplementedError)\b", re.I)
DECL_RE = re.compile(r"^\s*(?:def|class|function|export\s+(?:default\s+)?(?:function|class|const)|(?:pub\s+)?fn|interface|type|module|func)\s+([A-Za-z_$][\w$]*)")
SECRET_CONTENT_RE = re.compile(
    r"(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|^\s*(?:api[_-]?key|secret[_-]?key|access[_-]?token|password)\s*[:=]\s*[^\s${<][^\n]{5,})",
    re.IGNORECASE | re.MULTILINE,
)
LANG_BY_EXT = {
    ".py": "python", ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript",
    ".ts": "typescript", ".tsx": "typescript", ".jsx": "javascript", ".rs": "rust",
    ".go": "go", ".rb": "ruby", ".java": "java", ".kt": "kotlin", ".c": "c",
    ".h": "c", ".cpp": "cpp", ".hpp": "cpp", ".sh": "shell", ".html": "html",
    ".css": "css", ".sql": "sql", ".md": "markdown",
}


def sha(text: str, length: int = 16) -> str:
    return hashlib.sha256(text.encode("utf-8", "surrogateescape")).hexdigest()[:length]


def canonical_bytes(value: Any) -> bytes:
    # ASCII escaping keeps POSIX surrogateescaped filenames valid UTF-8 JSON.
    return (json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def excluded_name(name: str, is_dir: bool = False) -> bool:
    low = name.lower()
    if is_dir:
        return name in EXCLUDED_DIRS or low in {x.lower() for x in EXCLUDED_DIRS}
    if low in SECRET_NAMES or low.startswith(".env.") or SECRET_PARTS.search(low):
        return True
    suffix = Path(low).suffix
    return suffix in SECRET_EXTENSIONS or suffix in BINARY_EXTENSIONS


def safe_entries(directory: Path) -> list[os.DirEntry[str]]:
    try:
        with os.scandir(directory) as it:
            return sorted(list(it), key=lambda e: (e.name.casefold(), e.name))
    except (OSError, PermissionError):
        return []


def is_plain_dir(entry: os.DirEntry[str]) -> bool:
    try:
        return entry.is_dir(follow_symlinks=False) and not entry.is_symlink()
    except OSError:
        return False


def contains_marker(directory: Path) -> bool:
    for entry in safe_entries(directory):
        try:
            if entry.is_file(follow_symlinks=False) and entry.name in PROJECT_MARKERS:
                return True
        except OSError:
            pass
    return False


def discover_exhibits(roots: list[str]) -> list[tuple[Path, str]]:
    found: dict[str, tuple[Path, str]] = {}
    for root_index, supplied in enumerate(roots, 1):
        raw = Path(os.path.abspath(os.path.expanduser(supplied)))
        if raw.is_symlink() or not raw.is_dir():
            raise ValueError(f"root is not a real directory (symlinks are refused): {supplied}")
        root_alias = f"root-{root_index}:{raw.name or 'root'}"
        queue: list[tuple[Path, int]] = [(raw, 0)]
        root_found = False
        while queue:
            current, depth = queue.pop(0)
            if contains_marker(current):
                key = os.path.normcase(str(current))
                relative = current.relative_to(raw).as_posix()
                display_path = root_alias if relative == "." else f"{root_alias}/{relative}"
                found.setdefault(key, (current, display_path))
                root_found = True
                continue
            if depth >= LIMITS["max_depth"]:
                continue
            for entry in safe_entries(current):
                if is_plain_dir(entry) and not excluded_name(entry.name, True) and not entry.name.startswith("."):
                    queue.append((Path(entry.path), depth + 1))
        if not root_found:
            found.setdefault(os.path.normcase(str(raw)), (raw, root_alias))
    ordered = sorted(found.values(), key=lambda item: (item[1].casefold(), item[1]))
    return ordered[: LIMITS["max_exhibits"]]


def iter_candidate_files(root: Path) -> Iterable[tuple[Path, str]]:
    queue: list[tuple[Path, str]] = [(root, "")]
    while queue:
        directory, prefix = queue.pop(0)
        for entry in safe_entries(directory):
            rel = f"{prefix}/{entry.name}" if prefix else entry.name
            try:
                if entry.is_symlink():
                    continue
                if entry.is_dir(follow_symlinks=False):
                    if not excluded_name(entry.name, True) and not entry.name.startswith("."):
                        queue.append((Path(entry.path), rel))
                elif entry.is_file(follow_symlinks=False) and not excluded_name(entry.name):
                    yield Path(entry.path), rel.replace(os.sep, "/")
            except OSError:
                continue


def read_text(path: Path) -> tuple[str, bytes] | None:
    """Open a regular file without following its final symlink and read it boundedly."""
    fd = None
    try:
        before = path.stat(follow_symlinks=False)
        flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(path, flags)
        opened = os.fstat(fd)
        if (before.st_dev, before.st_ino) != (opened.st_dev, opened.st_ino):
            return None
        if not stat.S_ISREG(opened.st_mode) or opened.st_size > LIMITS["max_file_bytes"]:
            return None
        chunks = []
        remaining = LIMITS["max_file_bytes"] + 1
        while remaining:
            chunk = os.read(fd, min(65536, remaining))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        data = b"".join(chunks)
        if len(data) > LIMITS["max_file_bytes"]:
            return None
    except (OSError, PermissionError):
        return None
    finally:
        if fd is not None:
            try:
                os.close(fd)
            except OSError:
                pass
    if b"\x00" in data:
        return None
    sample = data[:8192]
    controls = sum(1 for byte in sample if byte < 9 or 13 < byte < 32)
    if sample and controls / len(sample) > 0.02:
        return None
    text = data.decode("utf-8", "replace")
    if SECRET_CONTENT_RE.search(text):
        return None
    return text, data


def git_state(root: Path) -> dict[str, Any] | None:
    env = {**os.environ, "GIT_OPTIONAL_LOCKS": "0", "GIT_TERMINAL_PROMPT": "0"}
    command = ["git", "-c", "core.fsmonitor=false", "-c", "core.untrackedCache=false", "-C", str(root),
               "status", "--porcelain=v1", "--untracked-files=no"]
    try:
        result = subprocess.run(command, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, text=True, timeout=3, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode:
        return None
    lines = sorted(line[:2] for line in result.stdout.splitlines() if len(line) >= 2)
    return {"tracked_changes": len(lines), "status_codes": lines[:100]}


def evidence(exhibit_id: str, kind: str, path: str | None, line: int | None, detail: str) -> dict[str, Any]:
    key = f"{exhibit_id}\0{kind}\0{path or ''}\0{line or 0}\0{detail}"
    return {"id": "ev-" + sha(key), "kind": kind, "path": path, "line": line, "detail": detail[:240]}


def component(name: str, points: int, evidence_ids: list[str]) -> dict[str, Any]:
    return {"name": name, "points": points, "evidence_ids": sorted(set(evidence_ids))}


def score(components: list[dict[str, Any]]) -> dict[str, Any]:
    return {"value": min(100, sum(c["points"] for c in components)), "components": components}


def is_test_path(path: str) -> bool:
    return bool(re.search(r"(^|/)(tests?|spec)(/|_)|(?:_test|\.spec|\.test)\.", path, re.I))


def inspect_exhibit(root: Path, display_path: str, include_git: bool) -> dict[str, Any]:
    exhibit_id = "ex-" + sha(display_path)
    evs: list[dict[str, Any]] = []
    files: list[dict[str, Any]] = []
    fragments: list[dict[str, Any]] = []
    todo_ids: list[str] = []
    declaration_ids: list[str] = []
    languages: dict[str, int] = {}
    bytes_seen = 0
    truncated = False
    truncation_reasons: set[str] = set()
    evidence_omitted = 0

    for path, rel in iter_candidate_files(root):
        if len(files) >= LIMITS["max_files_per_exhibit"]:
            truncated = True
            truncation_reasons.add("file-count")
            break
        item = read_text(path)
        if item is None:
            continue
        text, raw = item
        if bytes_seen + len(raw) > LIMITS["max_exhibit_bytes"]:
            truncated = True
            truncation_reasons.add("exhibit-bytes")
            break
        bytes_seen += len(raw)
        language = LANG_BY_EXT.get(path.suffix.lower())
        if language:
            languages[language] = languages.get(language, 0) + 1
        files.append({"path": rel, "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(), "language": language})
        file_evidence = 0
        test_path = is_test_path(rel)
        for number, line in enumerate(text.splitlines(), 1):
            clean = line.strip()
            if TODO_RE.search(line):
                if file_evidence < LIMITS["max_evidence_per_file"] and len(evs) < LIMITS["max_evidence_per_exhibit"] - 4:
                    ev = evidence(exhibit_id, "unfinished-marker", rel, number, clean)
                    evs.append(ev); todo_ids.append(ev["id"]); file_evidence += 1
                else:
                    evidence_omitted += 1; truncated = True; truncation_reasons.add("evidence")
            match = DECL_RE.match(line)
            if match and not test_path:
                if (len(fragments) < LIMITS["max_fragments_per_exhibit"] and
                        file_evidence < LIMITS["max_evidence_per_file"] and
                        len(evs) < LIMITS["max_evidence_per_exhibit"] - 4):
                    ev = evidence(exhibit_id, "declaration", rel, number, f"Reusable declaration: {match.group(1)}")
                    evs.append(ev); declaration_ids.append(ev["id"]); file_evidence += 1
                    fragments.append({
                        "id": "fr-" + sha(f"{exhibit_id}\0{rel}\0{number}"), "name": match.group(1),
                        "kind": "declaration", "path": rel, "line_start": number, "line_end": number,
                        "preview": clean[:200], "evidence_ids": [ev["id"]],
                    })
                else:
                    evidence_omitted += 1; truncated = True; truncation_reasons.add("evidence")
    files.sort(key=lambda f: f["path"])
    fragments.sort(key=lambda f: (f["path"], f["line_start"], f["name"]))
    names = {f["path"].lower() for f in files}
    has_readme = any(p == "readme" or p.startswith("readme.") for p in names)
    test_files = [f for f in files if is_test_path(f["path"])]
    source_files = [f for f in files if f["language"] and f["language"] not in {"markdown", "html", "css"}]
    if todo_ids:
        pass
    if not has_readme:
        ev = evidence(exhibit_id, "missing-documentation", None, None, "No README found in the scanned exhibit")
        evs.append(ev)
        missing_readme_id = ev["id"]
    else:
        readme = next(f for f in files if f["path"].lower() == "readme" or f["path"].lower().startswith("readme."))
        ev = evidence(exhibit_id, "documentation", readme["path"], 1, "README is present")
        evs.append(ev); readme_id = ev["id"]
    if source_files and not test_files:
        ev = evidence(exhibit_id, "missing-tests", None, None, "Source files are present but no test files were found")
        evs.append(ev); missing_tests_id = ev["id"]
    elif test_files:
        ev = evidence(exhibit_id, "tests", test_files[0]["path"], 1, f"{len(test_files)} test file(s) found")
        evs.append(ev); tests_id = ev["id"]
    if languages:
        ev = evidence(exhibit_id, "languages", None, None, "Languages: " + ", ".join(sorted(languages)))
        evs.append(ev); language_id = ev["id"]

    unfinished_components: list[dict[str, Any]] = []
    if todo_ids:
        unfinished_components.append(component("unfinished markers", min(50, 10 + len(todo_ids) * 5), todo_ids))
    if not has_readme:
        unfinished_components.append(component("missing documentation", 20, [missing_readme_id]))
    if source_files and not test_files:
        unfinished_components.append(component("missing tests", 30, [missing_tests_id]))
    reuse_components: list[dict[str, Any]] = []
    if source_files:
        reuse_components.append(component("recognizable source", min(30, 10 + len(source_files)), [language_id]))
    if declaration_ids:
        reuse_components.append(component("named fragments", min(40, len(declaration_ids) * 5), declaration_ids))
    if has_readme:
        reuse_components.append(component("documented intent", 15, [readme_id]))
    if test_files:
        reuse_components.append(component("tested behavior", 15, [tests_id]))

    needs = []
    if todo_ids: needs.append({"kind": "completion", "evidence_ids": sorted(todo_ids)[:20]})
    if not has_readme: needs.append({"kind": "documentation", "evidence_ids": [missing_readme_id]})
    if source_files and not test_files: needs.append({"kind": "tests", "evidence_ids": [missing_tests_id]})
    provisions = []
    if test_files: provisions.append({"kind": "tests", "evidence_ids": [tests_id]})
    if has_readme: provisions.append({"kind": "documentation", "evidence_ids": [readme_id]})
    if declaration_ids: provisions.append({"kind": "implementation", "evidence_ids": sorted(declaration_ids)[:20]})
    for language in sorted({f["language"] for f in source_files}):
        provisions.append({"kind": f"language:{language}", "evidence_ids": [language_id]})

    fingerprint_input = "".join(f"{f['path']}\0{f['sha256']}\0" for f in files)
    result = {
        "id": exhibit_id, "name": root.name, "source_root": display_path, "supplied_root": display_path.split("/", 1)[0],
        "source_fingerprint": hashlib.sha256(fingerprint_input.encode("utf-8", "surrogateescape")).hexdigest(),
        "file_count": len(files), "text_bytes": bytes_seen, "truncated": truncated,
        "truncation": {"reasons": sorted(truncation_reasons), "evidence_omitted": evidence_omitted},
        "languages": dict(sorted(languages.items())), "files": files, "evidence": sorted(evs, key=lambda e: e["id"]),
        "fragments": fragments, "needs": needs, "provisions": provisions,
        "scores": {"unfinishedness": score(unfinished_components), "reusability": score(reuse_components)},
    }
    if include_git:
        result["git"] = git_state(root)
    return result


_GENERIC_MATCH_WORDS = {
    "todo", "fixme", "hack", "xxx", "wip", "not", "implemented", "implement", "implementation",
    "finish", "complete", "completion", "improve", "reusable", "declaration", "src", "lib", "main",
}


def lexical_tokens(text: str) -> set[str]:
    expanded = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", text)
    return {word.lower() for word in re.findall(r"[A-Za-z][A-Za-z0-9]+", expanded)
            if len(word) >= 3 and word.lower() not in _GENERIC_MATCH_WORDS}


def code_languages(exhibit: dict[str, Any]) -> set[str]:
    return {item["language"] for item in exhibit["files"]
            if item["language"] and item["language"] not in {"markdown", "html", "css"}}


def build_affinities(exhibits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    affinities = []
    for target in exhibits:
        target_evidence = {item["id"]: item for item in target["evidence"]}
        target_files = {item["path"]: item for item in target["files"]}
        for source in exhibits:
            if target["id"] == source["id"]:
                continue
            source_evidence = {item["id"]: item for item in source["evidence"]}
            source_files = {item["path"]: item for item in source["files"]}
            matches = []
            for need in target["needs"]:
                for provision in source["provisions"]:
                    target_ids = list(need["evidence_ids"])
                    source_ids = list(provision["evidence_ids"])
                    matched = False
                    if need["kind"] == provision["kind"] == "documentation":
                        matched = True
                    elif need["kind"] == provision["kind"] == "tests":
                        matched = bool(code_languages(target) & code_languages(source))
                    elif need["kind"] == "completion" and provision["kind"] == "implementation":
                        selected_target = []
                        selected_source = []
                        for target_id in target_ids:
                            tev = target_evidence[target_id]
                            target_file = target_files.get(tev.get("path"))
                            target_language = target_file and target_file.get("language")
                            target_words = lexical_tokens((tev.get("detail") or "") + " " + (tev.get("path") or ""))
                            if not target_language or not target_words:
                                continue
                            for source_id in source_ids:
                                sev = source_evidence[source_id]
                                source_file = source_files.get(sev.get("path"))
                                if not source_file or source_file.get("language") != target_language:
                                    continue
                                source_words = lexical_tokens((sev.get("detail") or "") + " " + (sev.get("path") or ""))
                                if target_words & source_words:
                                    selected_target.append(target_id); selected_source.append(source_id)
                        target_ids = sorted(set(selected_target))
                        source_ids = sorted(set(selected_source))
                        matched = bool(target_ids and source_ids)
                    if matched:
                        matches.append({"need": need["kind"], "provision": provision["kind"],
                                        "target_evidence_ids": target_ids,
                                        "source_evidence_ids": source_ids})
            if matches:
                affinities.append({"id": "af-" + sha(target["id"] + source["id"]), "from_exhibit_id": source["id"],
                                   "to_exhibit_id": target["id"], "strength": min(100, 25 * len(matches)),
                                   "matches": matches})
    return sorted(affinities, key=lambda a: (-a["strength"], a["to_exhibit_id"], a["from_exhibit_id"]))


def build_recipes(exhibits: list[dict[str, Any]], affinities: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {e["id"]: e for e in exhibits}
    host_counts: dict[str, int] = {}
    recipes = []
    for affinity in affinities:
        host_id, donor_id = affinity["to_exhibit_id"], affinity["from_exhibit_id"]
        if host_counts.get(host_id, 0) >= LIMITS["max_recipes_per_host"]:
            continue
        donor, host = by_id[donor_id], by_id[host_id]
        donor_evidence = {item["id"]: item for item in donor["evidence"]}
        paths = []
        evidence_ids = []
        source_ids = []
        for match in affinity["matches"]:
            evidence_ids.extend(match["target_evidence_ids"] + match["source_evidence_ids"])
            source_ids.extend(match["source_evidence_ids"])
        provenance = []
        for source_id in sorted(set(source_ids)):
            ev = donor_evidence[source_id]
            path = ev.get("path")
            if path and path not in paths:
                paths.append(path)
                provenance.append({"path": path, "evidence_ids": [source_id]})
            elif path:
                next(item for item in provenance if item["path"] == path)["evidence_ids"].append(source_id)
            if len(paths) >= LIMITS["max_source_files_per_recipe"]:
                break
        if not paths:
            continue
        recipes.append({
            "id": "rr-" + sha(affinity["id"]), "affinity_id": affinity["id"],
            "host_exhibit_id": host_id, "donor_exhibit_id": donor_id,
            "title": f"Use {donor['name']} to advance {host['name']}",
            "rationale": "; ".join(f"{m['provision']} answers {m['need']}" for m in affinity["matches"]),
            "source_files": paths,
            "source_file_provenance": provenance,
            "evidence_ids": sorted(set(evidence_ids)),
            "steps": ["Review the linked evidence and source fragments.",
                      "Adapt the smallest relevant idea; do not copy project state or credentials.",
                      "Validate the adaptation inside the host project."],
        })
        host_counts[host_id] = host_counts.get(host_id, 0) + 1
        if len(recipes) >= LIMITS["max_recipes"]:
            break
    return recipes


def scan(roots: list[str], include_git: bool = False) -> dict[str, Any]:
    if not roots:
        raise ValueError("at least one root is required")
    exhibits = [inspect_exhibit(path, label, include_git) for path, label in discover_exhibits(roots)]
    exhibits.sort(key=lambda e: (e["name"].casefold(), e["source_root"]))
    affinities = build_affinities(exhibits)
    return {
        "schema": "cabinet-of-almosts/v1", "generator_version": VERSION, "limits": LIMITS,
        "roots": [f"root-{index}:{Path(os.path.abspath(os.path.expanduser(root))).name or 'root'}" for index, root in enumerate(roots, 1)], "exhibits": exhibits, "affinities": affinities,
        "resurrection_recipes": build_recipes(exhibits, affinities),
    }


def validate_snapshot(value: Any) -> dict[str, Any]:
    """Validate the served v1 shape and all cross-object/evidence references."""
    def require(condition: bool, message: str) -> None:
        if not condition:
            raise ValueError("invalid snapshot: " + message)

    require(isinstance(value, dict), "top level must be an object")
    require(value.get("schema") == "cabinet-of-almosts/v1", "unsupported schema")
    require(isinstance(value.get("generator_version"), str), "generator_version must be a string")
    require(isinstance(value.get("limits"), dict), "limits must be an object")
    require(isinstance(value.get("roots"), list) and all(isinstance(x, str) for x in value["roots"]), "roots must be strings")
    for key in ("exhibits", "affinities", "resurrection_recipes"):
        require(isinstance(value.get(key), list), f"{key} must be an array")

    exhibits: dict[str, dict[str, Any]] = {}
    evidence_by_exhibit: dict[str, dict[str, dict[str, Any]]] = {}
    files_by_exhibit: dict[str, set[str]] = {}
    for exhibit in value["exhibits"]:
        require(isinstance(exhibit, dict) and isinstance(exhibit.get("id"), str), "exhibit has no id")
        exhibit_id = exhibit["id"]
        require(exhibit_id not in exhibits, f"duplicate exhibit {exhibit_id}")
        for key in ("name", "source_root", "supplied_root", "source_fingerprint"):
            require(isinstance(exhibit.get(key), str), f"{exhibit_id}.{key} must be a string")
        for key in ("files", "evidence", "fragments", "needs", "provisions"):
            require(isinstance(exhibit.get(key), list), f"{exhibit_id}.{key} must be an array")
        require(isinstance(exhibit.get("scores"), dict), f"{exhibit_id}.scores must be an object")
        files = set()
        for item in exhibit["files"]:
            require(isinstance(item, dict) and isinstance(item.get("path"), str), f"{exhibit_id} has malformed file")
            require(item["path"] not in files, f"{exhibit_id} has duplicate file path")
            files.add(item["path"])
        evidence_map = {}
        for item in exhibit["evidence"]:
            require(isinstance(item, dict) and isinstance(item.get("id"), str) and isinstance(item.get("kind"), str),
                    f"{exhibit_id} has malformed evidence")
            require(item["id"] not in evidence_map, f"{exhibit_id} has duplicate evidence")
            require(item.get("path") is None or item.get("path") in files, f"{item['id']} references missing file")
            evidence_map[item["id"]] = item
        def check_refs(owner: str, ids: Any) -> None:
            require(isinstance(ids, list) and ids and all(isinstance(x, str) for x in ids), f"{owner} has malformed evidence_ids")
            require(set(ids) <= set(evidence_map), f"{owner} has broken evidence reference")
        for score_name in ("unfinishedness", "reusability"):
            score_value = exhibit["scores"].get(score_name)
            require(isinstance(score_value, dict) and isinstance(score_value.get("value"), int) and 0 <= score_value["value"] <= 100,
                    f"{exhibit_id}.{score_name} is malformed")
            require(isinstance(score_value.get("components"), list), f"{exhibit_id}.{score_name}.components is malformed")
            for component_value in score_value["components"]:
                require(isinstance(component_value, dict) and isinstance(component_value.get("points"), int) and component_value["points"] > 0,
                        f"{exhibit_id}.{score_name} has malformed component")
                check_refs(f"{exhibit_id}.{score_name}", component_value.get("evidence_ids"))
        for key in ("fragments", "needs", "provisions"):
            for item in exhibit[key]:
                require(isinstance(item, dict), f"{exhibit_id}.{key} item is malformed")
                check_refs(f"{exhibit_id}.{key}", item.get("evidence_ids"))
        exhibits[exhibit_id] = exhibit
        evidence_by_exhibit[exhibit_id] = evidence_map
        files_by_exhibit[exhibit_id] = files

    affinities: dict[str, dict[str, Any]] = {}
    for affinity in value["affinities"]:
        require(isinstance(affinity, dict) and isinstance(affinity.get("id"), str), "affinity has no id")
        require(affinity["id"] not in affinities, f"duplicate affinity {affinity['id']}")
        donor_id, host_id = affinity.get("from_exhibit_id"), affinity.get("to_exhibit_id")
        require(donor_id in exhibits and host_id in exhibits and donor_id != host_id, f"{affinity['id']} has broken exhibit reference")
        require(isinstance(affinity.get("matches"), list) and affinity["matches"], f"{affinity['id']} has no matches")
        for match in affinity["matches"]:
            require(isinstance(match, dict), f"{affinity['id']} has malformed match")
            for field, exhibit_id in (("target_evidence_ids", host_id), ("source_evidence_ids", donor_id)):
                ids = match.get(field)
                require(isinstance(ids, list) and ids and set(ids) <= set(evidence_by_exhibit[exhibit_id]),
                        f"{affinity['id']} has broken {field}")
        affinities[affinity["id"]] = affinity

    recipe_ids = set()
    for recipe in value["resurrection_recipes"]:
        require(isinstance(recipe, dict) and isinstance(recipe.get("id"), str), "recipe has no id")
        require(recipe["id"] not in recipe_ids, f"duplicate recipe {recipe['id']}"); recipe_ids.add(recipe["id"])
        affinity = affinities.get(recipe.get("affinity_id"))
        require(affinity is not None, f"{recipe['id']} has broken affinity reference")
        donor_id, host_id = recipe.get("donor_exhibit_id"), recipe.get("host_exhibit_id")
        require(donor_id == affinity["from_exhibit_id"] and host_id == affinity["to_exhibit_id"], f"{recipe['id']} direction disagrees with affinity")
        source_ids = {item for match in affinity["matches"] for item in match["source_evidence_ids"]}
        all_ids = source_ids | {item for match in affinity["matches"] for item in match["target_evidence_ids"]}
        require(isinstance(recipe.get("evidence_ids"), list) and set(recipe["evidence_ids"]) == all_ids,
                f"{recipe['id']} evidence does not equal affinity evidence")
        paths = recipe.get("source_files")
        provenance = recipe.get("source_file_provenance")
        require(isinstance(paths, list) and paths and len(paths) <= LIMITS["max_source_files_per_recipe"], f"{recipe['id']} has malformed source_files")
        require(isinstance(provenance, list) and [item.get("path") for item in provenance if isinstance(item, dict)] == paths,
                f"{recipe['id']} has malformed source provenance")
        for item in provenance:
            ids = item.get("evidence_ids")
            path = item.get("path")
            require(path in files_by_exhibit[donor_id] and isinstance(ids, list) and ids and set(ids) <= source_ids,
                    f"{recipe['id']} has broken source provenance")
            require(all(evidence_by_exhibit[donor_id][ev_id].get("path") == path for ev_id in ids),
                    f"{recipe['id']} source path is not derived from evidence")
    return value


class CabinetHandler(BaseHTTPRequestHandler):
    snapshot: bytes = b"{}\n"
    static_dir = Path(__file__).with_name("static")
    server_version = "CabinetOfAlmosts/0.1"

    def _send(self, status: int, body: bytes, content_type: str, head: bool = False) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()
        if not head:
            self.wfile.write(body)

    def _route(self, head: bool = False) -> None:
        path = urlsplit(self.path).path
        routes = {"/": ("index.html", "text/html; charset=utf-8"),
                  "/app.js": ("app.js", "text/javascript; charset=utf-8"),
                  "/style.css": ("style.css", "text/css; charset=utf-8")}
        if path == "/cabinet.json":
            self._send(200, self.snapshot, "application/json; charset=utf-8", head); return
        if path in routes:
            filename, content_type = routes[path]
            try:
                body = (self.static_dir / filename).read_bytes()
            except OSError:
                self._send(500, b"Static asset missing\n", "text/plain; charset=utf-8", head); return
            self._send(200, body, content_type, head); return
        self._send(404, b"Not found\n", "text/plain; charset=utf-8", head)

    def do_GET(self) -> None: self._route(False)
    def do_HEAD(self) -> None: self._route(True)
    def _readonly(self) -> None:
        self._send(405, b"Read-only server\n", "text/plain; charset=utf-8")
    do_POST = do_PUT = do_PATCH = do_DELETE = _readonly
    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stderr.write("cabinet http: " + fmt % args + "\n")


def make_server(snapshot: bytes, port: int) -> ThreadingHTTPServer:
    if not 0 <= port <= 65535:
        raise ValueError("port must be between 0 and 65535")
    handler = type("BoundCabinetHandler", (CabinetHandler,), {"snapshot": snapshot})
    return ThreadingHTTPServer(("127.0.0.1", port), handler)


def serve(snapshot: bytes, port: int) -> None:
    server = make_server(snapshot, port)
    print(f"Cabinet open at http://127.0.0.1:{server.server_port}/", flush=True)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()


def output_path_is_safe(output: str, roots: list[str]) -> Path:
    destination = Path(output).expanduser().absolute()
    resolved_destination = destination.resolve(strict=False)
    for root in roots:
        resolved_root = Path(root).expanduser().resolve(strict=True)
        try:
            inside = os.path.commonpath([str(resolved_destination), str(resolved_root)]) == str(resolved_root)
        except ValueError:
            inside = False
        if inside:
            raise ValueError(f"output must be outside supplied roots: {output}")
    return destination


def atomic_write(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=False, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except OSError:
            pass
        raise


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    sub = result.add_subparsers(dest="command", required=True)
    scan_p = sub.add_parser("scan", help="scan roots and write a canonical snapshot")
    scan_p.add_argument("roots", nargs="+"); scan_p.add_argument("--output", "-o", required=True)
    scan_p.add_argument("--git-status", action="store_true", help="include lock-free local git status (never fetches)")
    serve_p = sub.add_parser("serve", help="scan roots and serve the in-memory snapshot")
    serve_p.add_argument("roots", nargs="+"); serve_p.add_argument("--port", type=int, default=8765)
    serve_p.add_argument("--git-status", action="store_true")
    snap_p = sub.add_parser("serve-snapshot", help="serve an existing snapshot")
    snap_p.add_argument("file"); snap_p.add_argument("--port", type=int, default=8765)
    return result


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "scan":
            output = output_path_is_safe(args.output, args.roots)
            snapshot = scan(args.roots, args.git_status)
            validate_snapshot(snapshot)
            payload = canonical_bytes(snapshot)
            atomic_write(output, payload)
            print(f"Wrote {args.output} ({len(payload)} bytes)")
        elif args.command == "serve":
            snapshot = scan(args.roots, args.git_status)
            validate_snapshot(snapshot)
            serve(canonical_bytes(snapshot), args.port)
        else:
            data = Path(args.file).read_bytes()
            parsed = validate_snapshot(json.loads(data))
            serve(canonical_bytes(parsed), args.port)
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr); return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
