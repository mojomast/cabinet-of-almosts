#!/usr/bin/env python3
"""Static-only compatibility observations bound to a Cabinet v1 snapshot.

This module never imports, executes, builds, installs, or invokes package managers
for scanned projects. It reads only files already admitted to a Cabinet Exhibit.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import stat
import tomllib
from pathlib import Path
from typing import Any

import cabinet

SCHEMA = "cabinet-compatibility-observations/v1"
VERSION = "1.0.0"
# The current 320-project historical corpus is just under 4 MiB. Keep the
# untrusted sidecar bounded while allowing ample deterministic growth.
MAX_INPUT_BYTES = 8 * 1024 * 1024
MAX_MANIFEST_BYTES = 512 * 1024
MAX_INTERFACES = 64
MAX_EDGES_PER_NEED = 8
MAX_EDGES = 6000
MAX_PUBLIC_STRING = 1024
MAX_RECORDS_PER_PROFILE = 512
MANIFESTS = {
    "pyproject.toml": ("python", "pyproject"),
    "package.json": ("node", "package-json"),
    "Cargo.toml": ("rust", "cargo"),
    "go.mod": ("go", "go-module"),
    "Gemfile": ("ruby", "gemfile"),
    "composer.json": ("php", "composer"),
}
LANGUAGE_ECOSYSTEM = {
    "python": "python", "javascript": "node", "typescript": "node", "rust": "rust",
    "go": "go", "ruby": "ruby", "php": "php", "zig": "zig", "c": "native", "c++": "native",
}
TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9]{2,}")
DEPENDENCY_NAME = re.compile(r"^[A-Za-z0-9_.@/+:-]+")


def canonical_bytes(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True) + "\n").encode("utf-8")


def digest(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def record_id(prefix: str, *identity: Any) -> str:
    payload = [SCHEMA, prefix, *identity]
    return prefix + "-" + hashlib.sha256(canonical_bytes(payload)).hexdigest()[:20]


def _safe_read(root: Path, relative: str, expected_hash: str) -> str | None:
    parts = Path(relative).parts
    if not parts or Path(relative).is_absolute() or any(part in {"", ".", ".."} for part in parts):
        return None
    descriptors: list[int] = []
    try:
        flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
        descriptors.append(os.open(root, flags | getattr(os, "O_DIRECTORY", 0)))
        for part in parts[:-1]:
            descriptors.append(os.open(part, flags | getattr(os, "O_DIRECTORY", 0), dir_fd=descriptors[-1]))
        descriptor = os.open(parts[-1], flags, dir_fd=descriptors[-1])
        descriptors.append(descriptor)
        opened = os.fstat(descriptor)
        if not stat.S_ISREG(opened.st_mode) or opened.st_size > MAX_MANIFEST_BYTES:
            return None
        chunks = []
        remaining = MAX_MANIFEST_BYTES + 1
        while remaining:
            chunk = os.read(descriptor, min(65536, remaining))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        data = b"".join(chunks)
        if len(data) > MAX_MANIFEST_BYTES:
            return None
    except (OSError, PermissionError):
        return None
    finally:
        for descriptor in reversed(descriptors):
            try:
                os.close(descriptor)
            except OSError:
                pass
    if hashlib.sha256(data).hexdigest() != expected_hash or b"\x00" in data:
        return None
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return None


def _dependency_name(raw: str) -> str:
    if "://" in raw or re.search(r"(?i)\b(?:token|password|passwd|secret|api[_-]?key)\s*=", raw):
        return "<redacted-direct-reference>"
    match = DEPENDENCY_NAME.match(raw.strip())
    return match.group(0).lower() if match else raw.strip().lower()[:120]


def _public_string(value: Any, limit: int = 200) -> str | None:
    if not isinstance(value, str):
        return None
    if "://" in value or re.search(r"(?i)\b(?:token|password|passwd|secret|api[_-]?key)\s*=", value):
        return "<redacted>"
    return value[:limit]


def _manifest_payload(kind: str, text: str) -> dict[str, Any]:
    result: dict[str, Any] = {"parse_status": "parsed", "package_name": None, "dependencies": [], "runtime_constraints": {}}
    try:
        if kind == "package-json":
            value = json.loads(text)
            if not isinstance(value, dict): raise ValueError("package.json must contain an object")
            result["package_name"] = _public_string(value.get("name"))
            dependencies = set()
            for key in ("dependencies", "optionalDependencies", "peerDependencies", "devDependencies"):
                if isinstance(value.get(key), dict): dependencies.update(_dependency_name(str(item)) for item in value[key])
            result["dependencies"] = sorted(dependencies)[:512]
            if isinstance(value.get("engines"), dict) and isinstance(value["engines"].get("node"), str): result["runtime_constraints"]["node"] = _public_string(value["engines"]["node"], 120)
            result["script_names"] = sorted(filter(None, (_public_string(str(item), 120) for item in value.get("scripts", {}))))[:64] if isinstance(value.get("scripts"), dict) else []
            result["has_cli_entrypoint"] = isinstance(value.get("bin"), (str, dict))
        elif kind in {"pyproject", "cargo"}:
            value = tomllib.loads(text)
            if not isinstance(value, dict): raise ValueError("TOML manifest must contain a table")
            if kind == "pyproject":
                project = value.get("project", {}) if isinstance(value.get("project"), dict) else {}
                result["package_name"] = _public_string(project.get("name"))
                result["dependencies"] = sorted({_dependency_name(item) for item in project.get("dependencies", []) if isinstance(item, str)})[:512]
                if isinstance(project.get("requires-python"), str): result["runtime_constraints"]["python"] = _public_string(project["requires-python"], 120)
                result["has_cli_entrypoint"] = any(isinstance(project.get(key), dict) and project[key] for key in ("scripts", "gui-scripts"))
            else:
                package = value.get("package", {}) if isinstance(value.get("package"), dict) else {}
                result["package_name"] = _public_string(package.get("name"))
                deps = value.get("dependencies", {})
                result["dependencies"] = sorted(_dependency_name(str(item)) for item in deps)[:512] if isinstance(deps, dict) else []
                if isinstance(package.get("rust-version"), str): result["runtime_constraints"]["rust"] = _public_string(package["rust-version"], 120)
                result["has_cli_entrypoint"] = bool(value.get("bin"))
        elif kind == "go-module":
            module = re.search(r"(?m)^\s*module\s+(\S+)", text); version = re.search(r"(?m)^\s*go\s+(\S+)", text)
            result["package_name"] = module.group(1)[:200] if module else None
            result["dependencies"] = sorted(set(re.findall(r"(?m)^\s*([A-Za-z0-9_.-]+\.[A-Za-z0-9_./-]+)\s+v\S+", text)))[:512]
            if version: result["runtime_constraints"]["go"] = version.group(1)[:120]
            result["has_cli_entrypoint"] = False
        elif kind == "gemfile":
            result["dependencies"] = sorted({_dependency_name(item) for item in re.findall(r"(?m)^\s*gem\s+['\"]([^'\"]+)", text)})[:512]
            ruby = re.search(r"(?m)^\s*ruby\s+['\"]([^'\"]+)", text)
            if ruby: result["runtime_constraints"]["ruby"] = _public_string(ruby.group(1), 120)
            result["has_cli_entrypoint"] = False
        elif kind == "composer":
            value = json.loads(text)
            if not isinstance(value, dict): raise ValueError("composer.json must contain an object")
            result["package_name"] = _public_string(value.get("name"))
            deps = value.get("require", {}); result["dependencies"] = sorted(_dependency_name(str(item)) for item in deps)[:512] if isinstance(deps, dict) else []
            result["has_cli_entrypoint"] = bool(value.get("bin"))
    except (ValueError, TypeError, tomllib.TOMLDecodeError, json.JSONDecodeError):
        result = {"parse_status": "malformed", "package_name": None, "dependencies": [], "runtime_constraints": {}, "has_cli_entrypoint": False}
    return result


def _license_status(text: str) -> str:
    lowered = text.lower()
    if "permission is hereby granted, free of charge" in lowered: return "mit-template-observed"
    if "apache license" in lowered and "version 2.0" in lowered: return "apache-2.0-template-observed"
    if "gnu general public license" in lowered: return "gpl-template-observed"
    return "license-file-observed"


def _tokens(values: list[str]) -> set[str]:
    generic = {"main", "test", "tests", "helper", "config", "model", "data", "file", "value", "result"}
    return {token.lower() for value in values for token in TOKEN_RE.findall(value) if token.lower() not in generic}


def _profile(exhibit: dict[str, Any], root_value: str | None) -> dict[str, Any]:
    root = None
    if root_value:
        candidate = Path(root_value)
        try:
            if not candidate.is_symlink() and candidate.is_dir():
                root = candidate.resolve(strict=True)
        except OSError:
            root = None
    files = {item["path"]: item for item in exhibit.get("files", [])}
    manifests = []
    for path, file_record in sorted(files.items()):
        name = Path(path).name
        if name not in MANIFESTS or root is None: continue
        text = _safe_read(root, path, file_record["sha256"])
        if text is None: continue
        ecosystem, kind = MANIFESTS[name]; parsed = _manifest_payload(kind, text)
        identity = record_id("cm", exhibit["id"], path, file_record["sha256"], kind)
        manifests.append({"id": identity, "path": path, "file_sha256": file_record["sha256"], "kind": kind, "ecosystem": ecosystem, "evidence_level": "statically_verified" if parsed["parse_status"] == "parsed" else "observed", **parsed})
    ecosystems = sorted({item["ecosystem"] for item in manifests} | {LANGUAGE_ECOSYSTEM[key.lower()] for key in exhibit.get("languages", {}) if key.lower() in LANGUAGE_ECOSYSTEM})
    licenses = []
    for path, file_record in sorted(files.items()):
        if not re.match(r"(?i)(?:^|/)(?:license|copying|notice)(?:[._-].*)?$", path): continue
        text = _safe_read(root, path, file_record["sha256"]) if root else None
        status = _license_status(text or "")
        licenses.append({"id": record_id("cl", exhibit["id"], path, file_record["sha256"], status), "path": path, "file_sha256": file_record["sha256"], "status": status, "evidence_level": "observed", "limitations": ["License-file presence is not legal compatibility verification."]})
    paths = set(files)
    signals = set()
    if any(re.search(r"(?:^|/)(?:cli|main|command)(?:\.[^.]+)?$", path, re.I) or "/bin/" in f"/{path}/" for path in paths) or any(item.get("has_cli_entrypoint") for item in manifests): signals.add("cli")
    if exhibit.get("fragments"): signals.add("library")
    if any(Path(path).suffix.lower() in {".html", ".css"} for path in paths): signals.add("web")
    if any(re.search(r"(?:^|/)(?:server|api|service|dockerfile)", path, re.I) for path in paths): signals.add("service")
    if any(re.search(r"(?:^|/)(?:config|configs|settings|schemas?)(?:/|[._-])|(?:^|/)\.env(?:\.|$)", path, re.I) for path in paths): signals.add("config")
    interfaces = []
    for fragment in sorted(exhibit.get("fragments", []), key=lambda item: (item.get("path", ""), item.get("line_start", 0), item.get("name", "")))[:MAX_INTERFACES]:
        interfaces.append({"id": record_id("ci", exhibit["id"], fragment["id"]), "fragment_id": fragment["id"], "name": fragment["name"], "path": fragment["path"], "line": fragment["line_start"], "kind": fragment["kind"], "evidence_level": "observed", "limitations": ["A shallow declaration does not establish behavioral compatibility."]})
    tests = [item for item in exhibit.get("evidence", []) if item.get("kind") == "tests"]
    docs = [item for item in exhibit.get("evidence", []) if item.get("kind") == "documentation"]
    observations = []
    for kind, present, support in (("tests", bool(tests), [item["id"] for item in tests]), ("documentation", bool(docs), [item["id"] for item in docs])):
        observations.append({"id": record_id("co", exhibit["id"], kind, present), "kind": kind, "present": present, "cabinet_evidence_ids": support, "evidence_level": "observed", "execution_status": "not_run" if kind == "tests" else None})
    provisions = []
    for kind, condition, support in (
        ("protocol_adapter_pattern", bool(signals & {"cli", "web", "service"}), [item["id"] for item in interfaces[:16]]),
        ("library_interface", bool(interfaces), [item["id"] for item in interfaces[:16]]),
        ("manifest_pattern", bool(manifests), [item["id"] for item in manifests]),
        ("test_pattern", bool(tests), [item["id"] for item in observations if item["kind"] == "tests"]),
        ("documentation_pattern", bool(docs), [item["id"] for item in observations if item["kind"] == "documentation"]),
        ("configuration_pattern", "config" in signals, []),
        ("license_metadata", bool(licenses), [item["id"] for item in licenses]),
    ):
        if condition: provisions.append({"id": record_id("cp", exhibit["id"], kind, sorted(support)), "kind": kind, "support_ids": sorted(support), "evidence_level": "observed"})
    host_needs = []
    for need in exhibit.get("needs", []):
        kind = f"legacy_{need['kind']}"
        host_needs.append({"id": record_id("hn", exhibit["id"], kind, sorted(need.get("evidence_ids", []))), "kind": kind, "origin": "cabinet_v1_need", "cabinet_evidence_ids": sorted(need.get("evidence_ids", [])), "observation_ids": [], "evidence_level": "observed", "status": "open"})
    migration_needs = []
    if signals & {"cli", "web", "service"}: migration_needs.append("monorepo_protocol_adapter")
    if not manifests: migration_needs.append("manifest_review")
    if "config" in signals: migration_needs.append("configuration_contract")
    if not licenses: migration_needs.append("license_review")
    for kind in migration_needs:
        host_needs.append({"id": record_id("hn", exhibit["id"], kind), "kind": kind, "origin": "monorepo_admission_policy", "cabinet_evidence_ids": [], "observation_ids": [], "evidence_level": "hypothesis" if kind == "monorepo_protocol_adapter" else "observed", "status": "open"})
    return {"exhibit_id": exhibit["id"], "name": exhibit["name"], "source_fingerprint": exhibit["source_fingerprint"], "root_resolved": root is not None, "ecosystems": ecosystems, "manifests": manifests, "licenses": licenses, "signals": sorted(signals), "interfaces": interfaces, "observations": observations, "provisions": provisions, "host_needs": sorted(host_needs, key=lambda item: (item["kind"], item["id"])), "compatibility_blockers": [], "truncation": {"reasons": ["cabinet_exhibit_truncated"] if exhibit.get("truncated") else [], "records_omitted": exhibit.get("truncation", {}).get("evidence_omitted", 0)}}


def _candidate_score(host: dict[str, Any], donor: dict[str, Any], need: dict[str, Any]) -> tuple[int, list[str], list[str]]:
    shared_ecosystems = sorted(set(host["ecosystems"]) & set(donor["ecosystems"]))
    if not shared_ecosystems: return 0, [], []
    donor_kinds = {item["kind"] for item in donor["provisions"]}
    requirements = {
        "monorepo_protocol_adapter": "protocol_adapter_pattern", "manifest_review": "manifest_pattern",
        "configuration_contract": "configuration_pattern", "legacy_tests": "test_pattern",
        "legacy_documentation": "documentation_pattern", "legacy_completion": "library_interface",
    }
    required = requirements.get(need["kind"])
    if required is None or required not in donor_kinds: return 0, [], []
    matched = ["ecosystem"]
    score = 8
    shared_signals = sorted(set(host["signals"]) & set(donor["signals"]))
    if shared_signals: score += 2 * len(shared_signals); matched.append("role")
    host_manifest_kinds = {item["kind"] for item in host["manifests"]}; donor_manifest_kinds = {item["kind"] for item in donor["manifests"]}
    if host_manifest_kinds & donor_manifest_kinds: score += 4; matched.append("manifest_kind")
    host_dependencies = {dep for item in host["manifests"] for dep in item.get("dependencies", [])}; donor_dependencies = {dep for item in donor["manifests"] for dep in item.get("dependencies", [])}
    if host_dependencies & donor_dependencies: score += min(4, len(host_dependencies & donor_dependencies)); matched.append("dependency_name")
    host_tokens = _tokens([item["name"] for item in host["interfaces"]]); donor_tokens = _tokens([item["name"] for item in donor["interfaces"]])
    if host_tokens & donor_tokens: score += min(6, len(host_tokens & donor_tokens)); matched.append("interface_token")
    support = sorted({item["id"] for item in donor["provisions"] if item["kind"] == required} | {item["id"] for item in donor["manifests"][:4]})
    return score, matched, support


def _edges(profiles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    edges = []
    for host in profiles:
        for need in host["host_needs"]:
            ranked = []
            for donor in profiles:
                if donor["exhibit_id"] == host["exhibit_id"]: continue
                score, matched, support = _candidate_score(host, donor, need)
                if score: ranked.append((score, donor["name"].casefold(), donor, matched, support))
            for score, _, donor, matched, support in sorted(ranked, key=lambda item: (-item[0], item[1], item[2]["exhibit_id"]))[:MAX_EDGES_PER_NEED]:
                identity = record_id("cx", donor["exhibit_id"], host["exhibit_id"], need["id"], sorted(support))
                edges.append({"id": identity, "kind": "compatibility_observation", "from_exhibit_id": donor["exhibit_id"], "to_exhibit_id": host["exhibit_id"], "host_need_id": need["id"], "support_ids": support, "blocker_ids": [], "static_assessment": "matched_observations", "runtime_assessment": "not_run", "evidence_level": "observed", "checks_performed": matched, "unassessed_dimensions": ["behavior", "build", "license", "security"], "rank_factors": {"matched_dimension_count": len(matched), "deterministic_points": score}})
                if len(edges) >= MAX_EDGES: return sorted(edges, key=lambda item: (item["to_exhibit_id"], item["host_need_id"], item["from_exhibit_id"], item["id"]))
    return sorted(edges, key=lambda item: (item["to_exhibit_id"], item["host_need_id"], item["from_exhibit_id"], item["id"]))


def _exact(value: Any, keys: set[str], label: str, optional: set[str] | None = None) -> None:
    if not isinstance(value, dict) or not keys - (optional or set()) <= set(value) or set(value) - keys:
        raise ValueError(f"{label} has malformed or extra fields")


_CONTROL = re.compile(r"[\x00-\x1f\x7f-\x9f]")
_LOCAL_PATH = re.compile(r"(?i)(?:file://|(?:^|[\s(])/(?!/)|(?:^|[\s(])[a-z]:[\\/])")
_CREDENTIAL_URL = re.compile(r"(?i)\b[a-z][a-z0-9+.-]*://[^/\s]+@")
_SECRET_ASSIGNMENT = re.compile(r"(?i)\b(?:token|password|passwd|secret|api[_-]?key|access[_-]?key|private[_-]?key)\s*[:=]\s*\S")


def _string(value: Any, label: str, limit: int = MAX_PUBLIC_STRING, *, nullable: bool = False) -> None:
    if nullable and value is None:
        return
    if not isinstance(value, str) or len(value) > limit or _CONTROL.search(value):
        raise ValueError(f"{label} has malformed public text")
    if _LOCAL_PATH.search(value) or _CREDENTIAL_URL.search(value) or _SECRET_ASSIGNMENT.search(value):
        raise ValueError(f"{label} contains unsafe public text")


def _strings(value: Any, label: str, count: int, limit: int = MAX_PUBLIC_STRING) -> None:
    if not isinstance(value, list) or len(value) > count:
        raise ValueError(f"{label} exceeds its collection bound")
    for item in value:
        _string(item, label, limit)


def _enum(value: Any, allowed: set[Any], label: str) -> None:
    if value not in allowed:
        raise ValueError(f"{label} has unsupported value")


def _validate_record_shape(field: str, record: dict[str, Any]) -> None:
    if field == "manifests":
        keys = {"id", "path", "file_sha256", "kind", "ecosystem", "evidence_level", "parse_status", "package_name", "dependencies", "runtime_constraints", "has_cli_entrypoint", "script_names"}
        _exact(record, keys, "Manifest", {"script_names"})
        for key in ("id", "path", "file_sha256", "kind", "ecosystem"): _string(record[key], f"Manifest {key}")
        _string(record["package_name"], "Manifest package name", 200, nullable=True)
        _strings(record["dependencies"], "Manifest dependencies", 512, 200)
        if not isinstance(record["runtime_constraints"], dict) or len(record["runtime_constraints"]) > 16: raise ValueError("Manifest runtime constraints are malformed")
        for key, value in record["runtime_constraints"].items(): _string(key, "runtime name", 40); _string(value, "runtime constraint", 120, nullable=True)
        if "script_names" in record: _strings(record["script_names"], "Manifest script names", 64, 120)
        if type(record["has_cli_entrypoint"]) is not bool: raise ValueError("Manifest CLI observation is malformed")
        _enum(record["parse_status"], {"parsed", "malformed"}, "Manifest parse status"); _enum(record["evidence_level"], {"observed", "statically_verified"}, "Manifest evidence level")
    elif field == "licenses":
        _exact(record, {"id", "path", "file_sha256", "status", "evidence_level", "limitations"}, "License")
        for key in ("id", "path", "file_sha256", "status"): _string(record[key], f"License {key}")
        _enum(record["evidence_level"], {"observed"}, "License evidence level"); _strings(record["limitations"], "License limitations", 8)
    elif field == "interfaces":
        _exact(record, {"id", "fragment_id", "name", "path", "line", "kind", "evidence_level", "limitations"}, "Interface")
        for key in ("id", "fragment_id", "name", "path", "kind"): _string(record[key], f"Interface {key}")
        if type(record["line"]) is not int or not 1 <= record["line"] <= 10_000_000: raise ValueError("Interface line is malformed")
        _enum(record["evidence_level"], {"observed"}, "Interface evidence level"); _strings(record["limitations"], "Interface limitations", 8)
    elif field == "observations":
        _exact(record, {"id", "kind", "present", "cabinet_evidence_ids", "evidence_level", "execution_status"}, "Observation")
        _string(record["id"], "Observation id"); _enum(record["kind"], {"tests", "documentation"}, "Observation kind")
        if type(record["present"]) is not bool: raise ValueError("Observation presence is malformed")
        _strings(record["cabinet_evidence_ids"], "Observation evidence references", 512); _enum(record["evidence_level"], {"observed"}, "Observation evidence level"); _enum(record["execution_status"], {"not_run", None}, "Observation execution status")
    elif field == "provisions":
        _exact(record, {"id", "kind", "support_ids", "evidence_level"}, "Provision")
        _string(record["id"], "Provision id"); _string(record["kind"], "Provision kind", 120); _strings(record["support_ids"], "Provision support references", 512); _enum(record["evidence_level"], {"observed"}, "Provision evidence level")
    elif field == "host_needs":
        _exact(record, {"id", "kind", "origin", "cabinet_evidence_ids", "observation_ids", "evidence_level", "status"}, "Host Need")
        for key in ("id", "kind", "origin"): _string(record[key], f"Host Need {key}", 200)
        _strings(record["cabinet_evidence_ids"], "Host Need evidence references", 512); _strings(record["observation_ids"], "Host Need observation references", 64)
        _enum(record["evidence_level"], {"observed", "hypothesis"}, "Host Need evidence level"); _enum(record["status"], {"open"}, "Host Need status")
    else:
        raise ValueError("Compatibility blockers are not supported by this generator version")


def hydrate(snapshot: dict[str, Any], roots_by_name: dict[str, str]) -> dict[str, Any]:
    cabinet.validate_snapshot(snapshot)
    profiles = [_profile(exhibit, roots_by_name.get(exhibit["name"])) for exhibit in snapshot["exhibits"]]
    profiles.sort(key=lambda item: item["exhibit_id"])
    result = {
        "schema": SCHEMA, "generator_version": VERSION,
        "cabinet_binding": {"schema": snapshot["schema"], "canonical_sha256": hashlib.sha256(cabinet.canonical_bytes(snapshot)).hexdigest(), "exhibit_count": len(snapshot["exhibits"])},
        "scan_policy": {"static_only": True, "project_code_executed": False, "package_managers_executed": False, "dependencies_installed": False, "network_used": False, "secret_values_recorded": False},
        "limits": {"max_interfaces_per_exhibit": MAX_INTERFACES, "max_edges_per_need": MAX_EDGES_PER_NEED, "max_total_edges": MAX_EDGES},
        "profiles": profiles, "compatibility_edges": _edges(profiles),
    }
    validate(result, snapshot)
    return result


def _validate(sidecar: dict[str, Any], snapshot: dict[str, Any]) -> dict[str, Any]:
    _exact(sidecar, {"schema", "generator_version", "cabinet_binding", "scan_policy", "limits", "profiles", "compatibility_edges"}, "Compatibility sidecar")
    if sidecar.get("schema") != SCHEMA or sidecar.get("generator_version") != VERSION:
        raise ValueError("unsupported compatibility schema")
    _string(sidecar["schema"], "Compatibility schema", 100)
    _string(sidecar["generator_version"], "Generator version", 40)
    cabinet.validate_snapshot(snapshot)
    expected_hash = hashlib.sha256(cabinet.canonical_bytes(snapshot)).hexdigest()
    binding = sidecar.get("cabinet_binding", {})
    _exact(binding, {"schema", "canonical_sha256", "exhibit_count"}, "Cabinet binding")
    if not isinstance(binding, dict) or binding.get("schema") != snapshot["schema"] or binding.get("canonical_sha256") != expected_hash or binding.get("exhibit_count") != len(snapshot["exhibits"]):
        raise ValueError("compatibility sidecar does not match Cabinet snapshot")
    policy = sidecar.get("scan_policy")
    required_policy = {
        "static_only": True, "project_code_executed": False, "package_managers_executed": False,
        "dependencies_installed": False, "network_used": False, "secret_values_recorded": False,
    }
    _exact(policy, set(required_policy), "Scan policy")
    if not isinstance(policy, dict) or any(policy.get(key) is not value for key, value in required_policy.items()):
        raise ValueError("compatibility sidecar has unsafe scan policy")
    limits = sidecar.get("limits")
    expected_limits = {"max_interfaces_per_exhibit": MAX_INTERFACES, "max_edges_per_need": MAX_EDGES_PER_NEED, "max_total_edges": MAX_EDGES}
    _exact(limits, set(expected_limits), "Compatibility limits")
    if limits != expected_limits:
        raise ValueError("compatibility sidecar has unsupported limits")
    exhibits = {item["id"]: item for item in snapshot["exhibits"]}
    profiles = sidecar.get("profiles")
    if not isinstance(profiles, list) or len(profiles) != len(exhibits):
        raise ValueError("compatibility profiles do not equal Exhibit set")
    profile_by_id = {}
    all_record_ids = set()
    record_ids_by_profile: dict[str, set[str]] = {}
    support_ids_by_profile: dict[str, set[str]] = {}
    for profile in profiles:
        if not isinstance(profile, dict):
            raise ValueError("compatibility profile must be an object")
        _exact(profile, {"exhibit_id", "name", "source_fingerprint", "root_resolved", "ecosystems", "manifests", "licenses", "signals", "interfaces", "observations", "provisions", "host_needs", "compatibility_blockers", "truncation"}, "Compatibility profile")
        exhibit_id = profile.get("exhibit_id")
        if exhibit_id not in exhibits or exhibit_id in profile_by_id:
            raise ValueError("compatibility profiles do not equal Exhibit set")
        exhibit = exhibits[exhibit_id]
        if profile.get("name") != exhibit["name"] or profile.get("source_fingerprint") != exhibit["source_fingerprint"]:
            raise ValueError("compatibility profile identity mismatch")
        for key in ("exhibit_id", "name", "source_fingerprint"):
            _string(profile[key], f"Profile {key}")
        _strings(profile["ecosystems"], "Profile ecosystems", 32, 80)
        _strings(profile["signals"], "Profile signals", 16, 80)
        _exact(profile["truncation"], {"reasons", "records_omitted"}, "Profile truncation")
        _strings(profile["truncation"]["reasons"], "Profile truncation reasons", 16, 120)
        if type(profile["truncation"]["records_omitted"]) is not int or not 0 <= profile["truncation"]["records_omitted"] <= 10_000_000:
            raise ValueError("Profile truncation count is malformed")
        if not isinstance(profile.get("root_resolved"), bool):
            raise ValueError("compatibility profile has malformed scalar observations")
        profile_by_id[exhibit_id] = profile
        record_ids_by_profile[exhibit_id] = set()
        support_ids_by_profile[exhibit_id] = set()
        for field in ("manifests", "licenses", "interfaces", "observations", "provisions", "host_needs", "compatibility_blockers"):
            if not isinstance(profile.get(field), list): raise ValueError(f"profile has malformed {field}")
            if len(profile[field]) > (MAX_INTERFACES if field == "interfaces" else MAX_RECORDS_PER_PROFILE): raise ValueError(f"profile {field} exceeds collection limit")
            for record in profile[field]:
                if not isinstance(record, dict): raise ValueError(f"profile has malformed {field}")
                _validate_record_shape(field, record)
                rid = record.get("id")
                if not isinstance(rid, str) or rid in all_record_ids: raise ValueError("duplicate or missing compatibility record id")
                all_record_ids.add(rid)
                record_ids_by_profile[exhibit_id].add(rid)
                if field in {"manifests", "licenses", "interfaces", "observations", "provisions"}:
                    support_ids_by_profile[exhibit_id].add(rid)
        file_paths = {item["path"] for item in exhibit.get("files", [])}
        files = {item["path"]: item for item in exhibit.get("files", [])}
        if any(item.get("path") not in file_paths for field in ("manifests", "licenses", "interfaces") for item in profile[field]):
            raise ValueError("compatibility source path is not in Exhibit")
        for field in ("manifests", "licenses"):
            for record in profile[field]:
                if record.get("file_sha256") != files[record["path"]].get("sha256"):
                    raise ValueError("compatibility file hash does not match Exhibit")
        fragments = {item["id"]: item for item in exhibit.get("fragments", [])}
        for interface in profile["interfaces"]:
            fragment = fragments.get(interface.get("fragment_id"))
            if not fragment or interface.get("path") != fragment.get("path") or interface.get("line") != fragment.get("line_start") or interface.get("name") != fragment.get("name"):
                raise ValueError("compatibility interface does not match Exhibit Fragment")
        evidence_ids = {item["id"] for item in exhibit.get("evidence", [])}
        observation_ids = {item["id"] for item in profile["observations"]}
        if any(not set(item.get("cabinet_evidence_ids", [])) <= evidence_ids for item in profile["observations"] + profile["host_needs"]):
            raise ValueError("compatibility record has broken Cabinet Evidence reference")
        if any(not set(item.get("observation_ids", [])) <= observation_ids for item in profile["host_needs"]):
            raise ValueError("Host Need has broken observation reference")
        for provision in profile["provisions"]:
            if not set(provision.get("support_ids", [])) <= support_ids_by_profile[exhibit_id]:
                raise ValueError("Provision has foreign support reference")
    if set(profile_by_id) != set(exhibits):
        raise ValueError("compatibility profiles do not equal Exhibit set")
    edges = sidecar.get("compatibility_edges")
    if not isinstance(edges, list) or len(edges) > MAX_EDGES:
        raise ValueError("compatibility edge collection is malformed or exceeds limit")
    edge_ids = set()
    edge_counts: dict[str, int] = {}
    for edge in edges:
        if not isinstance(edge, dict) or not isinstance(edge.get("id"), str) or edge.get("id") in edge_ids: raise ValueError("duplicate or malformed compatibility edge")
        _exact(edge, {"id", "kind", "from_exhibit_id", "to_exhibit_id", "host_need_id", "support_ids", "blocker_ids", "static_assessment", "runtime_assessment", "evidence_level", "checks_performed", "unassessed_dimensions", "rank_factors"}, "Compatibility edge")
        for key in ("id", "kind", "from_exhibit_id", "to_exhibit_id", "host_need_id", "static_assessment", "runtime_assessment", "evidence_level"):
            _string(edge[key], f"Compatibility edge {key}")
        _strings(edge["support_ids"], "Compatibility edge supports", 512)
        _strings(edge["blocker_ids"], "Compatibility edge blockers", 128)
        _strings(edge["checks_performed"], "Compatibility edge checks", 16, 80)
        _strings(edge["unassessed_dimensions"], "Compatibility edge unassessed dimensions", 16, 80)
        _exact(edge["rank_factors"], {"matched_dimension_count", "deterministic_points"}, "Compatibility edge rank factors")
        if any(type(edge["rank_factors"][key]) is not int or not 0 <= edge["rank_factors"][key] <= 10_000 for key in edge["rank_factors"]): raise ValueError("Compatibility edge rank factors are malformed")
        if edge["kind"] != "compatibility_observation": raise ValueError("compatibility edge has unsupported kind")
        edge_ids.add(edge["id"])
        host, donor = edge.get("to_exhibit_id"), edge.get("from_exhibit_id")
        if host not in profile_by_id or donor not in profile_by_id or host == donor: raise ValueError("compatibility edge has broken Exhibit reference")
        if edge.get("host_need_id") not in {item["id"] for item in profile_by_id[host]["host_needs"]}: raise ValueError("compatibility edge has broken Host Need")
        if edge.get("runtime_assessment") != "not_run" or edge.get("static_assessment") != "matched_observations" or edge.get("evidence_level") != "observed": raise ValueError("compatibility edge overstates assessment")
        if not set(edge.get("support_ids", [])) <= support_ids_by_profile[donor]: raise ValueError("compatibility edge has foreign or broken support IDs")
        blockers = set(edge.get("blocker_ids", []))
        allowed_blockers = {item["id"] for item in profile_by_id[host]["compatibility_blockers"] + profile_by_id[donor]["compatibility_blockers"]}
        if not blockers <= allowed_blockers: raise ValueError("compatibility edge has broken blocker IDs")
        if not isinstance(edge.get("checks_performed"), list) or not all(isinstance(item, str) for item in edge["checks_performed"]): raise ValueError("compatibility edge has malformed checks")
        edge_counts[edge["host_need_id"]] = edge_counts.get(edge["host_need_id"], 0) + 1
        if edge_counts[edge["host_need_id"]] > MAX_EDGES_PER_NEED: raise ValueError("compatibility edge limit exceeded for Host Need")
    return sidecar


def validate(sidecar: dict[str, Any], snapshot: dict[str, Any], *,
             input_size: int | None = None) -> dict[str, Any]:
    if input_size is not None and (
            type(input_size) is not int or input_size < 0 or input_size > MAX_INPUT_BYTES):
        raise ValueError(f"compatibility sidecar input exceeds {MAX_INPUT_BYTES} bytes")
    try:
        return _validate(sidecar, snapshot)
    except ValueError:
        raise
    except (TypeError, KeyError, AttributeError) as exc:
        raise ValueError("malformed compatibility sidecar") from exc
