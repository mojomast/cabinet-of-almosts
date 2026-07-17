# Cabinet of Almosts — MVP Specification

## 1. Purpose

The Cabinet turns bounded, static observations of explicitly named local roots into a deterministic collection of Exhibits. Its novel output is provenance-preserving recombination: score components, affinities, and recipes remain linked to Evidence rather than opaque model judgments.

It is an inventory and suggestion tool. It never modifies a scanned root and never executes project code.

## 2. Commands

```
python3 cabinet.py scan ROOT... --output FILE [--git-status]
python3 cabinet.py serve ROOT... [--port PORT] [--git-status]
python3 cabinet.py serve-snapshot FILE [--port PORT]
```

`scan` is the sole persistence action. The output path is required, must be outside every scanned root, and is replaced atomically. `serve` holds the snapshot in memory. `serve-snapshot` validates the v1 schema and evidence references before canonically reserializing its JSON input. Servers bind to IPv4 loopback only.

## 3. Discovery and read policy

Each supplied root is normalized for display, converted to an absolute scan path, checked to be a non-symlink directory, then inspected breadth-first. A directory containing a known marker (README, common package manifest, Makefile) is an Exhibit and discovery does not descend through it. Discovery depth is 3. If no marker is found beneath a supplied root, that root is an Exhibit.

Traversal is sorted by case-folded name then original name. `os.scandir`, `DirEntry.is_*` with `follow_symlinks=False`, and regular-file mode checks enforce containment. Symlinks and special files are never read. Races can produce a skipped/unreadable file, never intentional traversal through a link.

Excluded directories include VCS metadata, dependencies (`node_modules`, `vendor`), virtual environments, caches, test coverage, build outputs, `target`, `dist`, and generated directories. Excluded files include environment/credential/token/key names, key stores, databases, logs, archives, media, fonts, executables, compiled objects, bytecode, lock files, NUL-bearing/binary-like data, and recognizable credential-bearing contents.

No subprocess runs unless `--git-status` is requested. That option runs bounded local `git status`, with optional locks and prompts disabled; there is no network or fetch command.

## 4. Determinism and canonical JSON

Given the same ordered root arguments, root-relative paths, readable bytes, and optional git state, output bytes are stable. Absolute scan paths are replaced by `root-N:<basename>` aliases. No timestamps, random IDs, platform timing, or file mtimes are included. Objects use lexicographically sorted keys, compact separators, UTF-8, and one trailing newline. Lists with semantic ordering are explicitly sorted. IDs are prefixes plus truncated SHA-256 of stable provenance tuples.

A Source Fingerprint is full SHA-256 over each sorted observed relative path and its full content SHA-256. Content itself is not copied into the snapshot beyond bounded one-line Evidence details and Fragment previews.

Top-level fields:

- `schema`, `generator_version`, `limits`, `roots`
- `exhibits`
- `affinities`
- `resurrection_recipes`

## 5. Evidence and scores

Evidence has `id`, `kind`, optional relative `path` and `line`, and bounded `detail`. Current observations include unfinished markers, declarations, languages, README/test presence, and README/test absence.

Each score has a 0–100 `value` and `components`. Every positive component has points and one or more Evidence IDs. IDs must resolve within that Exhibit.

Unfinishedness components:

- unfinished markers: `min(50, 10 + 5 × count)`
- missing documentation: 20
- source without detected tests: 30

Reusability components:

- recognizable source: `min(30, 10 + source file count)`
- named declarations: `min(40, 5 × count)`
- documented intent: 15
- detected tests: 15

The scores are heuristics, not quality claims.

## 6. Fragments, affinities, and recipes

Fragments are intentionally shallow: a regex-recognized named declaration, its relative file, a single line range/preview, and declaration Evidence. They do not claim semantic extraction.

Needs currently represent completion, documentation, and tests. Provisions represent implementation, documentation, tests, and observed languages. An Affinity is directional, from donor Provision to host Need. Documentation matches directly; test support requires a shared code language; implementation-to-completion matches require the same file language plus non-generic lexical overlap between host evidence and donor declarations. Test declarations are not implementation provisions. Strength is `min(100, 25 × matches)`.

Recipes are derived in sorted affinity order and include host, donor, rationale, linked Evidence, up to three donor source files, and three fixed human-review steps. Bounds are 12 total and two per host. Recipes never edit or copy files.

## 7. Limits

| Limit | Value |
|---|---:|
| Discovery depth | 3 |
| Exhibits | 200 |
| Files / Exhibit | 4,000 |
| Bytes / text file | 512 KiB |
| Bytes / Exhibit | 16 MiB |
| Fragments / Exhibit | 24 |
| Evidence / file | 32 |
| Evidence / Exhibit | 256 |
| Recipes | 12 |
| Recipes / host | 2 |
| Source files / recipe | 3 |

Truncation is reported on an Exhibit when file-count, aggregate-byte, fragment, or evidence caps stop collection. Evidence truncation includes an omitted-observation count.

## 8. HTTP and UI

Fixed routes are `/`, `/app.js`, `/style.css`, and `/cabinet.json`. GET and HEAD are supported. POST, PUT, PATCH, and DELETE return 405. Other paths return 404. Responses disable sniffing and caching and set a local-only restrictive Content Security Policy.

The bundled UI offers Gallery, Workbench, and Method views. It has no remote assets. Dynamic values are rendered with DOM element creation and `textContent`, never `innerHTML`.

## 9. Non-goals

Deep AST analysis, semantic equivalence, generated patches, dependency installation, remote repositories, network discovery, full secret classification, and filesystem watching are outside the MVP.
