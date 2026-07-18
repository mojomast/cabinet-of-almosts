# The Cabinet of Almosts

A local, read-only instrument for finding unfinished projects and evidence-supported ways their reusable pieces might help one another.

The Cabinet is intentionally **not** an AI wrapper, code runner, build tool, or autonomous merger. It deterministically scans only roots you name, records bounded evidence, identifies shallow fragments, and derives directional affinities. The result is a canonical JSON snapshot and a static Gallery/Cupboard/Evidence graph/Method interface.

The **Cupboard** is an in-browser recombination instrument. Choose a host, select detected or user-directed goals, prefer or exclude donors, steer breadth/novelty/compatibility/risk, then arrange multiple evidence-backed pieces. You can lock pieces, replace one piece, iterate deterministic alternatives, compare up to three variants, and inspect the exact host observation → matching rule → donor evidence chain. Workspace state lives only in the page; no project or server state is written.

The **Compatibility workbench** is a Host-centered projection over the same immutable snapshot. It keeps the canonical donor→Host Affinity direction visible and can add an optional SHA-256-bound sidecar of static manifest, ecosystem, interface, and role observations. It offers a complete keyboard-accessible donor list beside a bounded visual map and lets a person choose exact Contribution Pieces. The selected Arrangement produces a deterministic, copyable **Recombination Brief** for a coding agent. The Brief treats snapshot text as untrusted, cites stable Evidence/Affinity/compatibility-observation IDs and source fingerprints, requires source/license/API preflight, and never turns a static observation into a claim of runtime compatibility or correctness. The app itself still executes and writes nothing.

The **Mashup map** can additionally mount an optional `cabinet-project-capability-map/v1` sidecar produced by a separate static code-review process. It gives every exact-corpus Exhibit a human-readable Capability Profile—purpose, features, accepted inputs, produced outputs, and declared Mashup Roles—plus a four-profile Conceptual Mashup. The sidecar is canonical-snapshot-bound, requires complete name/fingerprint coverage, cites only files admitted to the bound Exhibit, and is redacted before serving. Its graphs are source-declared conceptual projections, not runtime, API, build, license, security, or deployment compatibility claims. Generated capability maps stay outside Git.

## Quick start

Requires Python 3.10+ and no third-party packages.

```bash
python3 cabinet.py scan ~/projects/project-a ~/projects/project-b --output cabinet.json
python3 cabinet.py serve-snapshot cabinet.json --port 8765
# open http://127.0.0.1:8765/
```

Or scan and serve an in-memory snapshot:

```bash
python3 cabinet.py serve ~/projects --port 8765
```

### Autonomous build-cycle GitHub collection

The deployed Cabinet uses the strict one-commit subset of GitHub repositories created by the previous Hermes autonomous build cycle. Its explicit 320-repository provenance manifest lives in `datasets/autonomous-github-one-commit.csv`.

```bash
python3 scripts/build_historical_snapshot.py \
  --output /tmp/cabinet-historical.json \
  --compatibility-output /tmp/cabinet-compatibility.json
python3 cabinet.py serve-snapshot /tmp/cabinet-historical.json \
  --compatibility /tmp/cabinet-compatibility.json --port 18791
# If a separately produced exact-corpus capability map is available:
python3 cabinet.py serve-snapshot /tmp/cabinet-historical.json \
  --capability-map /tmp/project-capability-map.json --port 18792
```

Capability and compatibility sidecars are optional and validated before the loopback server binds. An absent capability-map route returns 404; an absent compatibility projection returns JSON `null` so the browser can retain its canonical Affinity fallback without a failed-resource warning. Invalid, foreign, incomplete, oversized, or snapshot-drifted sidecars fail closed.

Each row must resolve to a direct child of `~/builds`, contain a `.built` marker, have exactly one local commit, and have an `origin` matching the recorded `github.com/mojomast/...` repository. Two-commit autonomous repositories, local-only builds, unrelated `*ussy` repositories, ordinary projects under `~/projects`, Hermes state, and run logs are deliberately absent.

A supplied directory with a recognizable project marker is an Exhibit. Otherwise the scanner discovers marked project directories up to depth 3; if none exist, the supplied directory itself becomes an Exhibit. At most 500 Exhibits are retained.

Optional local git status is explicit:

```bash
python3 cabinet.py scan ~/projects/example --git-status -o cabinet.json
```

This invokes only `git status --porcelain --untracked-files=no`, with `GIT_OPTIONAL_LOCKS=0`, terminal prompts disabled, local cache features disabled, and a timeout. It never fetches. Git inspection is off by default.

## Safety model

- Roots must be explicitly supplied and must be real directories, not symlinks.
- `scan` requires an output path outside all scanned roots and replaces it atomically.
- Directory traversal uses `follow_symlinks=False`; file and directory symlinks are skipped.
- Only regular text files are read. Binary, oversized, secret-named, database, log, generated, cache, dependency, VCS, and special files are excluded.
- Files containing recognizable private-key or credential-assignment material are excluded wholesale.
- No project code is imported, parsed by a project tool, built, installed, or executed.
- Compatibility hydration reads only hash-verified manifest and license files already admitted to an Exhibit; it never invokes a package manager or project parser.
- Reads are capped at 512 KiB/file, 4,000 files and 16 MiB/Exhibit; Evidence is capped at 32 records/file and 256/Exhibit with visible truncation.
- The HTTP server binds only to `127.0.0.1`, exposes only fixed GET/HEAD routes, returns 405 for write methods, and has a restrictive CSP.
- Browser rendering uses `textContent` and constructed DOM nodes; snapshot strings are never injected as HTML. No remote assets are used.

This is defense in depth, not a secret-detection guarantee. Review roots before scanning and snapshots before sharing. Snapshots contain root aliases and relative source paths, one-line declaration previews, unfinished markers, and hashes; absolute scan paths are omitted.

## Vocabulary and output

- **Cabinet**: one canonical snapshot.
- **Exhibit**: a discovered project.
- **Evidence**: a stable, source-linked observation.
- **Almost / Need**: unfinishedness that could be advanced.
- **Fragment / Provision**: a shallow named declaration or capability.
- **Affinity**: a directional evidence match from a donor to a host.
- **Compatibility Profile**: optional hash-bound static observations for exactly one Exhibit.
- **Compatibility observation**: a deterministic donor lead based on named static dimensions; runtime, build, behavior, license, and security remain unassessed.
- **Contribution Piece**: one donor observation connected to one selected host direction.
- **Arrangement**: a bounded, deterministic set of Contribution Pieces from one or more donors.
- **Steering**: explicit browser-local goals, focus terms, donor choices, bounds, locks, and risk/compatibility policies.
- **Recombination Brief**: a deterministic plaintext implementation prompt projected from one Host and a user-selected Arrangement; it is not part of the Cabinet Snapshot.
- **Evidence Packet**: one Contribution Piece’s cited Host Evidence, matching Affinity, donor Evidence, adaptation intent, and cautions inside a Recombination Brief.
- **Resurrection Recipe**: the legacy pairwise adaptation suggestion retained in the v1 snapshot.
- **Plaque**: Gallery rendering of an Exhibit.
- **Source Fingerprint**: SHA-256 of sorted observed paths and content hashes.

See [SPEC.md](SPEC.md) for canonical snapshot schema, scoring, exclusions, and limits. See [docs/MONOREPO-BLUEPRINT.md](docs/MONOREPO-BLUEPRINT.md) for the measured federated-monorepo plan and admission gates.

## Tests

```bash
python3 -m unittest discover -s tests -v
```

Synthetic tests cover deterministic output and path privacy, secret and binary exclusion, symlink containment, excluded directories, bounded evidence, evidence-linked scores, negative affinity controls, recipe provenance and bounds, contextual unfinished-marker filtering, Zig/Nim recognition, deterministic multi-element arrangements, schema validation, arbitrary-byte filenames, output-path safety, and HTTP 405 behavior.

## Benchmark

The benchmark generates its tree in a temporary directory and deletes it afterward; it creates no repository artifacts.

```bash
python3 benchmarks/benchmark.py --projects 25 --files 80 --lines 30
```

It reports observed/generated files and bytes, elapsed time, files/second, and MiB/second. Scanner safety caps can make observed values lower than generated values.

## License

MIT. See [LICENSE](LICENSE).
