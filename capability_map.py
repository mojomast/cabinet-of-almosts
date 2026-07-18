"""Strict validation and public projection for project capability-map sidecars.

The source map is produced by a separate, static code-map process.  This module
never reads project paths.  It binds that map to a Cabinet snapshot and removes
private absolute locations before the map can be served.
"""
from __future__ import annotations

import hashlib
import json
import posixpath
import re
from typing import Any, Callable

SCHEMA = "cabinet-project-capability-map/v1"
MAX_INPUT_BYTES = 2 * 1024 * 1024
INTERFACES = {"cli", "data", "file", "library", "protocol", "web"}
CONFIDENCES = {"low", "medium", "high"}

_PROJECT_KEYS = {
    "project", "display_name", "path", "description", "primary_users", "provides",
    "accepts", "produces", "ecosystem", "maturity_signals", "feature_descriptions",
    "mashup_roles", "inspected_paths", "confidence",
}
_PUBLIC_PROJECT_KEYS = _PROJECT_KEYS - {"path"}
_SIMPLE_LISTS = ("primary_users", "accepts", "produces")
_PATH_RE = re.compile(r"^[^\x00-\x1f\x7f]+$")
_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_LOCAL_PATH_RE = re.compile(r"(?i)(?:^|[\s('\"=:])(?:file://|/(?:home|users|private|tmp|var|etc)/|[a-z]:[\\/])")
_CREDENTIAL_URL_RE = re.compile(r"(?i)\b[a-z][a-z0-9+.-]*://[^\s/@:]+:[^\s/@]+@")


def canonical_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def _fail(message: str) -> None:
    raise ValueError("invalid capability map: " + message)


def _object(value: Any, keys: set[str], owner: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != keys:
        _fail(f"{owner} must be an object with exactly {sorted(keys)}")
    return value


def _string(value: Any, owner: str, maximum: int = 512, *, nonempty: bool = True) -> str:
    if not isinstance(value, str) or (nonempty and not value) or len(value) > maximum:
        _fail(f"{owner} must be a bounded string")
    if any(ord(char) < 32 or ord(char) == 127 for char in value):
        _fail(f"{owner} contains a control character")
    return value


def _public_string(value: Any, owner: str, maximum: int = 512) -> str:
    text = _string(value, owner, maximum)
    if _LOCAL_PATH_RE.search(text) or _CREDENTIAL_URL_RE.search(text):
        _fail(f"{owner} contains a machine-local path or credential-bearing URL")
    return text


def _list(value: Any, owner: str, maximum: int, item: Callable[[Any, str], Any]) -> list[Any]:
    if not isinstance(value, list) or len(value) > maximum:
        _fail(f"{owner} must be a bounded array")
    return [item(entry, f"{owner}[{index}]") for index, entry in enumerate(value)]


def _text_list(value: Any, owner: str, maximum: int = 32) -> list[str]:
    result = _list(value, owner, maximum, lambda entry, item_owner: _public_string(entry, item_owner, 256))
    if len(result) != len(set(result)):
        _fail(f"{owner} contains duplicates")
    return result


def _relative_path(value: Any, owner: str) -> str:
    path = _string(value, owner, 512)
    # Treat paths as POSIX locators regardless of the host OS. Backslashes are
    # rejected rather than interpreted differently on Windows and POSIX.
    if not _PATH_RE.fullmatch(path) or "\\" in path or path.startswith("/"):
        _fail(f"{owner} must be a safe relative path")
    parts = path.split("/")
    if any(part in {"", ".", ".."} for part in parts) or posixpath.normpath(path) != path:
        _fail(f"{owner} must not contain traversal or empty components")
    return path


def _path_list(value: Any, owner: str, maximum: int = 128) -> list[str]:
    result = _list(value, owner, maximum, _relative_path)
    if len(result) != len(set(result)):
        _fail(f"{owner} contains duplicate paths")
    return result


def _evidenced(value: Any, owner: str, keys: set[str], files: set[str]) -> dict[str, Any]:
    source = _object(value, keys, owner)
    result: dict[str, Any] = {}
    for key in keys:
        if key == "evidence":
            result[key] = _path_list(source[key], f"{owner}.evidence", 64)
        elif key == "interfaces":
            interfaces = _text_list(source[key], f"{owner}.interfaces", 6)
            if not set(interfaces) <= INTERFACES:
                _fail(f"{owner}.interfaces contains an unsupported interface")
            result[key] = interfaces
        elif key == "complements":
            result[key] = _text_list(source[key], f"{owner}.complements", 32)
        else:
            result[key] = _public_string(source[key], f"{owner}.{key}", 1024)
    _check_admitted_paths(result.get("evidence", []), files)
    return result


def _check_admitted_paths(paths: list[str], admitted: set[str]) -> None:
    missing = [path for path in paths if path not in admitted]
    if missing:
        _fail(f"path is not admitted by the bound Cabinet Exhibit: {missing[0]}")


def _profile(value: Any, owner: str, exhibit: dict[str, Any]) -> dict[str, Any]:
    source = _object(value, _PROJECT_KEYS, owner)
    result: dict[str, Any] = {}
    for key in ("project", "display_name"):
        result[key] = _public_string(source[key], f"{owner}.{key}", 128)
    _string(source["path"], f"{owner}.path", 1024)  # validate, then redact
    result["description"] = _public_string(source["description"], f"{owner}.description", 2048)
    for key in _SIMPLE_LISTS:
        result[key] = _text_list(source[key], f"{owner}.{key}", 64)

    eco = _object(source["ecosystem"], {"frameworks", "languages", "protocols", "storage"}, f"{owner}.ecosystem")
    result["ecosystem"] = {key: _text_list(eco[key], f"{owner}.ecosystem.{key}", 32) for key in sorted(eco)}
    maturity = _object(source["maturity_signals"], {"docs", "tests", "working_entrypoints"}, f"{owner}.maturity_signals")
    if type(maturity["docs"]) is not bool or type(maturity["tests"]) is not bool:
        _fail(f"{owner}.maturity_signals docs/tests must be booleans")
    entrypoints = _path_list(maturity["working_entrypoints"], f"{owner}.maturity_signals.working_entrypoints", 64)
    result["maturity_signals"] = {"docs": maturity["docs"], "tests": maturity["tests"], "working_entrypoints": entrypoints}

    files = {item["path"] for item in exhibit["files"]}
    _check_admitted_paths(entrypoints, files)
    specs = (
        ("provides", 32, {"capability", "description", "evidence", "interfaces"}),
        ("feature_descriptions", 64, {"name", "description", "evidence"}),
        ("mashup_roles", 32, {"role", "why", "evidence", "complements"}),
    )
    for key, maximum, keys in specs:
        result[key] = _list(source[key], f"{owner}.{key}", maximum,
                            lambda entry, item_owner, keys=keys: _evidenced(entry, item_owner, keys, files))
    result["inspected_paths"] = _path_list(source["inspected_paths"], f"{owner}.inspected_paths", 256)
    _check_admitted_paths(result["inspected_paths"], files)
    confidence = _string(source["confidence"], f"{owner}.confidence", 16)
    if confidence not in CONFIDENCES:
        _fail(f"{owner}.confidence is unsupported")
    result["confidence"] = confidence
    result["exhibit_id"] = exhibit["id"]
    result["source_fingerprint"] = exhibit["source_fingerprint"]
    if set(result) != _PUBLIC_PROJECT_KEYS | {"exhibit_id", "source_fingerprint"}:
        _fail(f"{owner} public projection is incomplete")
    return result


def validate(value: Any, snapshot: dict[str, Any], *, input_size: int | None = None) -> dict[str, Any]:
    """Validate an untrusted map and return its canonical, redacted projection."""
    if input_size is not None and (type(input_size) is not int or input_size < 0 or input_size > MAX_INPUT_BYTES):
        _fail(f"input exceeds {MAX_INPUT_BYTES} bytes")
    top = _object(value, {"schema", "cabinet_binding", "projects"}, "top level")
    if top["schema"] != SCHEMA:
        _fail("unsupported schema")
    binding = _object(top["cabinet_binding"], {"canonical_sha256", "exhibit_count"}, "cabinet_binding")
    digest = binding["canonical_sha256"]
    if not isinstance(digest, str) or not _SHA256_RE.fullmatch(digest):
        _fail("cabinet_binding.canonical_sha256 is malformed")
    exhibits = snapshot.get("exhibits")
    if not isinstance(exhibits, list):
        _fail("snapshot has no Exhibits")
    if type(binding["exhibit_count"]) is not int or binding["exhibit_count"] != len(exhibits):
        _fail("cabinet_binding.exhibit_count does not match snapshot")
    expected = hashlib.sha256(canonical_bytes(snapshot)).hexdigest()
    if digest != expected:
        _fail("cabinet_binding.canonical_sha256 does not match canonical snapshot")
    by_name: dict[str, dict[str, Any]] = {}
    for exhibit in exhibits:
        name = exhibit.get("name")
        if not isinstance(name, str) or name in by_name:
            _fail("canonical Exhibit names must be unique strings")
        by_name[name] = exhibit
    projects = top["projects"]
    if not isinstance(projects, list) or len(projects) != len(exhibits):
        _fail("projects must contain exactly one profile per Exhibit")
    seen: set[str] = set()
    projected = []
    for index, project in enumerate(projects):
        if not isinstance(project, dict):
            _fail(f"projects[{index}] must be an object")
        name = project.get("project")
        if name not in by_name:
            _fail(f"projects[{index}].project is not a canonical Exhibit name")
        if name in seen:
            _fail(f"duplicate profile for Exhibit {name}")
        seen.add(name)
        projected.append(_profile(project, f"projects[{index}]", by_name[name]))
    if seen != set(by_name):
        _fail("one or more Exhibit profiles are missing")
    projected.sort(key=lambda item: (item["project"].casefold(), item["project"], item["exhibit_id"]))
    return {
        "schema": SCHEMA,
        "cabinet_binding": {"canonical_sha256": expected, "exhibit_count": len(exhibits)},
        "projects": projected,
    }
