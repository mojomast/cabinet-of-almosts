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
| Exhibits | 500 |
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

Fixed routes are `/`, `/app.js`, `/cupboard.js`, `/style.css`, and `/cabinet.json`. Optional validated projections add `/compatibility.json` and `/capability-map.json`; an absent capability map returns 404, while absent compatibility returns JSON `null` for a quiet canonical-Affinity fallback. GET and HEAD are supported. POST, PUT, PATCH, and DELETE return 405. Other paths return 404. Responses disable sniffing and caching and set a local-only restrictive Content Security Policy.

The bundled UI offers Gallery, Cupboard, and Method views. It has no remote assets. Dynamic values are rendered with DOM element creation and `textContent`, never `innerHTML`.

## 9. Cupboard assembly context

The Cupboard is a browser-local projection over a validated Cabinet Snapshot. It does not alter the canonical v1 observation contract.

- A **Host** is the single Exhibit whose selected directions define an arrangement.
- A **Contribution Piece** is one donor Evidence record or Fragment connected to one host direction by a visible deterministic rule.
- An **Arrangement** is a bounded set of Contribution Pieces from one or more unique donors.
- **Steering** consists of goals, focus terms, donor preferences/exclusions, breadth, novelty policy, compatibility policy, risk ceiling, and locked pieces.
- A **Variant** is one immutable result of applying Steering to a snapshot. Iteration appends variants rather than silently replacing the current result.

Candidate eligibility uses existing directional Affinities first. A user-directed test goal may additionally use a donor test Provision when host and donor share an observed code language. Documentation patterns remain advisory. Browser-derived ranking is explicitly a workspace heuristic, never a scanner score.

Every Piece carries a host observation where one exists, its matching factors, donor path/line Evidence, intended adaptation mode, and cautions. The UI must not claim buildability, API compatibility, behavioral equivalence, dependency compatibility, license compatibility, or correctness. Truncation and shallow-fragment limitations propagate visibly.

Arrangement selection is deterministic: stable candidate ordering, explicit integer controls, bounded donor/piece counts, and stable offset-based alternatives. Locks survive later iterations when still eligible. Exclusions cannot silently remove a locked piece. Comparison is capped at three variants.

### Architecture drift audit

The Observation context owns scanning and immutable Evidence. The Compatibility projection owns atomic donor-to-host claims. The Cupboard owns Steering and bounded arrangement selection. Presentation owns human labels and controls. None may reopen, execute, or modify a scanned source root. `Affinity` and `Resurrection Recipe` remain v1 compatibility terms; new UI code must not broaden their meaning into verified semantic compatibility.

### Evidence graph and prompt projection

The Evidence graph is a browser-local, Host-centered projection over existing v1 Affinities. It does not add graph records to the canonical snapshot. Canonical edge direction remains donor Exhibit → Host Exhibit, while the interface groups each edge under the selected Host for browsing. The complete donor list is the accessible source of truth; the visual SVG may show a clearly disclosed bounded subset to avoid an unreadable global hairball.

An edge expands into selectable Contribution Pieces backed by its source Evidence and, when present, its shallow Fragment. A manual graph Arrangement is bounded to eight Pieces from four donors. Selection does not mutate the snapshot, Cupboard Variants, project files, or server state.

A **Recombination Brief** is a deterministic plaintext implementation prompt projected from one Host, one manual Arrangement, and one user-authored Intent Note. Contract `cabinet-recombination-brief/v1` uses fixed section ordering, canonical JSON for all dynamic snapshot text, stable Evidence/Affinity IDs and Source Fingerprints, LF line endings, one trailing newline, and a 65,536-byte UTF-8 limit. Identical inputs produce identical bytes.

The Brief treats project names, paths, comments, README excerpts, Fragment previews, and Evidence details as untrusted quoted data. It requires the receiving coding agent to inspect cited source, licensing, dependencies, APIs, platform assumptions, and tests before changing an explicitly supplied Host checkout. It may request the smallest selected adaptation only after that preflight. It must not claim compatibility, buildability, behavioral equivalence, licensing, correctness, security, or project quality merely from the graph. Copying is explicit and browser-local; the Cabinet makes no model call and performs no implementation itself.

### Optional Capability Profile sidecar

Contract `cabinet-project-capability-map/v1` is a separate canonical projection and never changes `cabinet-of-almosts/v1`. It is bounded to 2 MiB, SHA-256-bound to the canonical Cabinet bytes, and must contain exactly one unique Profile for every Exhibit name. The server adds the bound Exhibit ID and Source Fingerprint, rejects evidence/entrypoint locators not admitted to that Exhibit, rejects machine-local or credential-bearing public text, removes absolute checkout roots, and canonicalizes the public response before binding.

A Capability Profile describes source-observed purpose, features, provided capabilities, accepted inputs, produced outputs, ecosystem, and Mashup Roles. The complete searchable Profile list is the accessible source of truth. A selected Profile graph shows at most 18 source-declared nodes. The Interactive Mashup Workspace selects at most four Profiles and fourteen individual source-declared features, so every selected node fits within the same 18-node visual bound. Project-to-project leads are limited to uniquely resolved source-declared complements and exact output-to-input wording matches after case and whitespace normalization. Leads are deterministically deduplicated and capped at 24; total and omitted counts remain visible. Every visual lead has an adjacent textual witness and limitation. Feature selection alone never creates a cross-project edge, ecosystem overlap alone creates no edge, and absence of a lead is not evidence of incompatibility. Neither projection claims runtime, API, schema, dependency, build, behavior, license, security, or deployment compatibility. The browser independently verifies the exact snapshot hash, corpus names, Exhibit IDs, Source Fingerprints, and public schema; rejection leaves Gallery, Cupboard, canonical Affinities, the Recombination Brief, and Method operational.

### Optional static compatibility sidecar

Contract `cabinet-compatibility-observations/v1` is a separate canonical JSON document and never extends or mutates `cabinet-of-almosts/v1`. Its `cabinet_binding.canonical_sha256` is the SHA-256 of the canonical Cabinet Snapshot bytes. Profile Exhibit IDs and Source Fingerprints must equal the complete Cabinet Exhibit set exactly; missing, duplicate, foreign, or drifted Profiles are rejected.

Hydration is static-only. It may read only regular, non-symlink manifest and license files already admitted to an Exhibit, within the scanner's size limit, and only when the current file SHA-256 equals the Cabinet file record. It may use Python's standard-library JSON and TOML parsers or bounded regular expressions. It must not import project modules, invoke package managers, install dependencies, execute scripts, access the network, or record secret values.

A Profile separates manifests, license-file observations, role signals, shallow interfaces, observations, Provisions, Host Needs, compatibility blockers, and truncation. `root_resolved` means only that the supplied source root was found; it does not mean the bounded scan was exhaustive. License-template detection is never a legal determination. Protocol-adapter Needs are hypotheses created by an explicit monorepo-admission policy.

A compatibility edge references one donor Exhibit, one Host Exhibit, one Host Need, and named sidecar support IDs. Current static assessments use `matched_observations`; runtime assessment is `not_run`. Behavior, build, license, and security remain explicitly unassessed. Deterministic points rank bounded leads but are not probabilities or quality scores. At most eight leads are retained per Need and 6,000 overall, so absence and rank are not exhaustive compatibility conclusions.

The loopback server exposes a compatibility document only when a validated sidecar is explicitly mounted. Otherwise `/compatibility.json` returns JSON `null` and the canonical Affinity graph remains usable. The browser independently checks schema, exact Profile coverage/fingerprints, edge references, and non-runtime assessment labels before hydration. Static-observation Contribution Pieces preserve compatibility edge/support IDs in the Recombination Brief and retain the fixed preflight contract.

## 10. Non-goals

Deep AST analysis, semantic equivalence, generated patches, dependency installation, remote repositories, network discovery, full secret classification, and filesystem watching are outside the MVP.
