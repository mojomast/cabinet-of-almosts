# The Works of Almosts: a federated polyglot tool foundry

**Status:** Proposed from the exact 320-Exhibit Cabinet corpus
**Evidence date:** Static candidate generated from the live-corpus baseline
**Deployment:** Not authorized
**Execution:** No project code, package manager, dependency installation, build, or test was run

## Task frame

Build a coherent monorepo from the 320 small tools without:

- losing or silently renaming an Exhibit;
- treating lexical similarity as runtime compatibility;
- forcing six ecosystems into one package manager;
- importing source whose redistribution or modification rights have not been approved;
- turning every project into one coupled application;
- weakening project-local build and test contracts before those contracts have been measured.

The safe immediate deliverable is a **catalog, protocol, orchestration, and admission-control monorepo**. Individual tool sources can move from quarantine into incubated workspace cells only after license, source-completeness, build, test, protocol, and security gates pass.

## Vocabulary map

| Term | Precise meaning |
|---|---|
| **Exhibit** | One canonical Cabinet project, identified by Exhibit ID and source fingerprint. The corpus has exactly 320. |
| **Profile** | Hash-bound static observations for exactly one Exhibit. A Profile does not execute or certify the project. |
| **Host Need** | An observed Cabinet gap or an explicit monorepo-admission requirement attached to an Exhibit. |
| **Donor observation** | A directional static lead from another Exhibit, tied to named observations and a Host Need. |
| **Compatibility observation** | A matched set of static dimensions. It is not a general compatibility claim. |
| **Verified support tuple** | Tool digest × artifact digest × protocol/version × capabilities × host version × environment × test-suite version. Only runtime gates can create one. |
| **Cell** | A bounded monorepo workspace or product family with explicit ownership and contracts. |
| **Shell** | An editor, web/API, or terminal delivery adapter. |
| **Kernel** | Transport-neutral domain behavior such as assessment, ranking, planning, simulation, or observation. |
| **Protocol** | A versioned process boundary and JSON schema used to compose independently built tools. |
| **Quarantine** | Static inventory only; no source integration or compatibility claim. |
| **Incubator** | Isolated build/test area for legally approved source with a normalized descriptor. |
| **Integrated** | A project with a scoped verified support tuple and required build, test, protocol, security, and ownership evidence. |

## Measured corpus

The candidate `/cabinet.json` is byte-identical to the preserved live baseline:

```text
SHA-256 9e3add310cdff7788e3bcfa1b203811ed55182ea01078c49d2ad2a44aa973169
Exhibits 320
```

The optional static sidecar covers the exact same 320 Exhibit IDs and source fingerprints:

| Observation | Count |
|---|---:|
| Resolved project roots | 320 |
| Profiles with one or more Host Needs | 314 |
| Static donor observations | 2,253 |
| Runtime assessments run | 0 |
| Profiles with observed interfaces | 293 |
| Profiles with observed tests | 319 |
| Profiles with observed documentation | 319 |
| Profiles affected by Cabinet scan truncation | 232 |
| Omitted Cabinet observation records | 5,887 |

### Ecosystem membership

Counts can overlap because seven projects have multiple observed ecosystems.

| Ecosystem | Profiles |
|---|---:|
| Python | 142 |
| Rust | 51 |
| Node | 47 |
| Go | 43 |
| Native C/C++ | 18 |
| Zig | 16 |
| No detected ecosystem | 12 |

All 282 recognized manifests parsed statically:

- 142 `pyproject.toml` records;
- 51 `Cargo.toml` records;
- 46 `package.json` records;
- 43 `go.mod` records.

Forty-six profiles need manifest review. The present parser does not normalize Zig `build.zig`/`build.zig.zon` or native Make projects.

### Admission Needs

| Host Need | Profiles |
|---|---:|
| License review | 306 |
| Common protocol-adapter hypothesis | 283 |
| Manifest review | 46 |
| Explicit configuration contract | 5 |
| Legacy completion gap | 4 |
| Legacy documentation gap | 1 |

Only 14 profiles contain observed license files. A license-shaped file is evidence for review, **not legal approval**. Current highest-proven admission lanes are therefore:

| Lane | Current count |
|---|---:|
| Quarantine / metadata-only | 320 |
| Legally approved vendor source | 0 |
| Incubator | 0 |
| Integrated | 0 |

## Structural model

The corpus repeatedly separates into delivery shells and functional kernels. That suggests a composable tool foundry rather than a single product.

```text
Editor shells (26)     Web/API shells (23)     Terminal shells (27)
          \                    |                       /
           +---------- versioned tool protocol -------+
                                  |
        +-------------------------+--------------------------+
        |                         |                          |
  Risk & safety             Decision & ranking         Plans & handoffs
  candidates (84)           candidates (157)           candidates (117)
        |                         |                          |
        +------------- Observation pipeline ----------------+
                       candidates (94)
                                  |
                 Forecast/simulation candidates (67)
                                  |
              Structured interchange candidates (102)
```

These functional counts are deterministic, overlapping predicates over observed interface names, dependencies, and shell signals. They are candidate ownership cells, not semantic certification.

### Product cells

1. **Editor-integrated analysis workbenches — 26**
   Shared candidate surfaces: command activation, workspace adapters, webview messages, status bars, report rendering. Representative Exhibits: `dualia`, `trialwise`, `silva`, `forge`, `stratum`, `memetix`, `retoura`.

2. **Hosted web/API decision applications — 23**
   Candidate surfaces: request/response envelopes, health/sample/analyze endpoints, JSON reports, FastAPI or Axum adapters. Representatives: `hone`, `migration`, `graviton`, `egressa`, `reverba`, `commonsa`, `saponin`.

3. **Terminal dashboards and guided consoles — 27**
   Candidate surfaces: cards, tables, selection actions, keyboard adapters, text/Markdown export. Representatives: `actuata`, `archivio`, `haccp`, `ludon`, `capilla`, `queue`, `calcara`.

4. **Repository and dependency analyzers — 14**
   Candidate surfaces: repository snapshots, history records, dependency nodes/edges, path/line findings, graph export. Representatives: `snapshot`, `graviton`, `chromato`, `kintsugi`, `dosemate`, `inkblot`, `memetix`, `endemic`.

5. **Hazard, safety, and vulnerability assessment — 84**
   Candidate surfaces: assessment context, findings, domain-owned severity bands, factor evidence, escalation boundaries, mitigations. Never normalize medical, financial, physical-safety, and engineering thresholds merely because all use “risk.”

6. **Decision scoring, ranking, and recommendation — 157**
   Candidate surfaces: options, weighted factors, uncertainty, deterministic rankings, recommendations, explanations. Internally separate ordinal rankings, calibrated uncertainty, rule-based recommendations, and domain indices.

7. **Plans, schedules, queues, checklists, and handoffs — 117**
   Candidate surfaces: IDs, ordering, explicit states, windows, owners, handoff metadata, plan validation. Domain lifecycle semantics remain separate until mapped and tested.

8. **Monitoring, diagnostics, scans, audits, and traces — 94**
   Candidate architecture: collector → evaluator → finding → renderer. Keep one-shot scans distinct from stateful monitors.

9. **Forecasting, simulation, and scenario analysis — 67**
   Candidate surfaces: scenario inputs, deterministic seeds, estimates, horizons, uncertainty, comparison results. Numerical validity and determinism are unverified.

10. **Structured interchange and report rendering — 102**
    Best first extraction target: versioned DTO schemas, CSV/JSON/YAML adapters, dictionary conversion, and Markdown/HTML/SVG/text renderers. Shared format names do not imply shared schemas.

### Bridge Exhibits

Use cross-cell projects as integration canaries, not shared-core dumping grounds:

- `hone`: web + risk + decision + planning + observation + interchange;
- `reverba`: web + risk + decision + observation + simulation + interchange;
- `transacta`: editor + decision + planning + simulation + interchange;
- `capilla`: terminal + risk + decision + planning + simulation;
- `circlera`: terminal + risk + planning + observation + interchange;
- `mash`: editor + risk + observation + simulation + interchange;
- `egressa`: web + risk + decision + planning + observation;
- `triagia`: editor + risk + planning + simulation + interchange;
- `circadia`: repository + observation + simulation + interchange;
- `cladwise`: editor + decision + observation + interchange;
- `fatigue`: observation + simulation + decision-adjacent;
- `kintsugi`: repository analysis + observation/reporting.

Dependency direction should remain:

```text
domain model
  -> functional kernel
  -> interchange contract
  -> editor/web/terminal shell
```

## Architecture decision

Adopt a **federated polyglot monorepo** with a language-neutral task graph and language-native project builds.

```text
/
├── quarantine/
│   └── references/                   # upstream identity and immutable digests; source only when authorized
├── projects/
│   └── <stable-exhibit-slug>/        # source layout preserved after promotion
├── catalog/
│   ├── projects.yaml                 # ID, fingerprint, upstream, owner, lane, cells
│   └── observations.json             # generated, hash-bound static projection
├── protocol/
│   ├── task-request-v1.schema.json
│   ├── task-result-v1.schema.json
│   ├── artifact-manifest-v1.schema.json
│   └── tool-capabilities-v1.schema.json
├── orchestration/
│   ├── tasks/
│   ├── adapters/{python,rust,node,go,zig,native}.yaml
│   └── toolchains/                   # pinned versions and image digests
├── workspaces/
│   ├── python/                       # generated logical memberships; independent solves first
│   ├── rust/                         # independent crates, then verified virtual-workspace shards
│   ├── node/                         # project locks first, workspace shards after canaries
│   ├── go/go.work                    # canary modules first
│   ├── zig/                          # independent build.zig registry
│   └── native/                       # wrapped Make projects with platform declarations
├── cells/
│   ├── shells/{editor,web,terminal}/
│   ├── kernels/{risk,decision,planning,observation,simulation}/
│   └── interchange/
├── ci/{images,matrices,policies}/
└── CODEOWNERS
```

Physical project paths use stable Exhibit slugs, not language directories. Multi-ecosystem projects keep one identity and an explicit internal task DAG.

### Root orchestration

Trial **moon** as the language-neutral task-graph runner behind a repository-owned `cabinet-build` adapter. Pin and verify it before adoption; the architecture depends on capabilities, not on one vendor.

```text
moon target
  -> cabinet-build <exhibit-id> <target>
  -> ecosystem-native command in an isolated runner
  -> task-result/v1 JSON + declared immutable artifacts
```

Canonical targets:

- `discover`
- `format-check`
- `lint`
- `build`
- `test`
- `package`
- `smoke`
- `license-scan`
- `security-scan`

Unsupported targets return `unsupported`; they never silently pass.

### Why not the obvious alternatives?

- **Not one npm/Nx/Turborepo workspace:** Node represents only 47 of 320 profiles.
- **Not immediate Bazel/Buck2/Pants conversion:** hundreds of unexecuted, partially truncated projects would require speculative build metadata, especially for Zig and Make.
- **Not one root lock per ecosystem:** runtime ranges, Rust MSRVs, Node engines, lock discipline, build scripts, and system dependencies remain unverified.
- **Not universal FFI:** six ecosystems and 283 CLI candidates favor process isolation. Static declaration overlap cannot establish ABI safety.
- **Not one universal container:** it would hide toolchain conflicts and create an oversized mutable environment.
- **Not submodules/polyrepo:** that loses atomic protocol changes, common admission policy, and reliable affected-project traversal.

## Common tool protocol

Use versioned JSON Schema over JSON Lines or bounded request/result files.

A request identifies:

- protocol schema version;
- Exhibit/project ID and exact source fingerprint;
- target and declared inputs;
- toolchain and platform;
- writable output root;
- network policy;
- environment allowlist;
- timeout and resource limits.

A result records:

- `passed`, `failed`, `unsupported`, or `blocked`;
- exact artifact paths and SHA-256 digests;
- test pass/fail/skip counts;
- structured diagnostics;
- toolchain fingerprint;
- duration and resource observations.

Rules:

- process exit status and result status agree;
- logs go to stderr; machine output goes to the result channel;
- artifacts are content-addressed and immutable;
- secrets never enter keys, logs, or cached payloads;
- services receive an allocated port and readiness/shutdown deadlines;
- cross-language composition starts with files or subprocess JSON, not FFI.

## Admission ledger

### Quarantine → incubator

Require all of:

1. immutable upstream identity and exact source digest;
2. affirmative redistribution/modification license decision with SPDX expression, notices, reviewer, policy version, and scope;
3. resolved truncation/source-completeness disposition;
4. normalized descriptor with owner, toolchains, manifests, locks, entrypoints, commands, outputs, permissions, and unknowns;
5. static secret/malware/security triage;
6. isolated runner policy and rollback owner.

### Incubator → integrated

Require all of:

1. two clean hermetic builds from empty workspaces;
2. matching artifact digests where byte reproducibility is expected, or documented normalized comparison;
3. required tests passing three times with zero required-test flakes;
4. 100% of mandatory protocol conformance cases passing;
5. complete dependency SBOM and license closure;
6. zero unresolved critical/high security findings;
7. signed artifact/build provenance;
8. an independently approved evidence packet;
9. a narrow published verified support tuple.

Changing source, lock, toolchain, protocol, descriptor, or security policy invalidates affected evidence.

## Ecosystem rollout

- **Python:** preserve 142 independent `pyproject.toml` builds first. Shard later by verified Python range and resolver/backend policy; do not start with one solve.
- **Rust:** preserve 51 standalone crates. Trial virtual workspaces only after MSRV, feature-unification, build-script, target, and lock behavior checks.
- **Node:** retain project-local npm locks initially. Verify engines, lifecycle scripts, module formats, peer dependencies, and package-manager choice before workspace shards.
- **Go:** canary `go.work` overlays while preserving each `go.mod`; verify Go 1.21–1.24 behavior, toolchain directives, replacements, CGO, tags, and sparse observed sums.
- **Zig:** register 16 independent `build.zig` roots and pin per-project Zig versions after discovery.
- **Native:** wrap 18 Make roots in isolated jobs with explicit compiler, OS/architecture, libc, system-library, output, and safe-clean metadata.
- **Unclassified:** keep 12 profiles in manifest-review quarantine until an adapter contract exists.

## Cache and CI model

Cache keys include source inputs, verified locks, adapter/task versions, toolchain/compiler, OS/architecture/libc, allowed environment values, dependency artifact digests, and protocol version. Networked, time-dependent, nondeterministic, service, and integration tasks remain non-cacheable until demonstrated otherwise.

CI lanes:

1. **Static admission:** schema, ownership, manifest, license, source completeness, secret/file policy.
2. **Affected PR:** changed projects, explicit reverse dependencies, adapter conformance.
3. **Merge:** required verified build/test targets for admitted projects.
4. **Nightly:** full clean matrix, service smoke checks, cache reproducibility.
5. **Release:** clean-room rebuild, digest/SBOM/provenance/license/security gates.

## Change set in this repository

- Preserve canonical `/cabinet.json` as the corpus ledger.
- Generate an optional, hash-bound `/compatibility.json` projection.
- Store one Profile for every Exhibit and reject missing, duplicate, mismatched-fingerprint, or broken-reference records.
- Label every current edge `matched_observations`; all runtime assessments remain `not_run`.
- Hydrate the human graph with canonical Affinities plus static-observation Pieces.
- Keep compatibility IDs and unresolved checks in Recombination Brief provenance.
- Add no deployment and import no tool source.

## Drift audit

| Risk | Control |
|---|---|
| Corpus changes while enriching the graph | Sidecar is optional and SHA-256-bound; canonical snapshot bytes remain unchanged. |
| “Compatibility” becomes an overclaim | UI and schema distinguish matched static observations from verified support tuples. |
| Header/range drift skips projects | Exact Profile ID and fingerprint set must equal the 320-Exhibit set. |
| Manifest files masquerade as application config | Configuration contracts require explicit config/settings/schema/`.env` paths. |
| Truncated scans look complete | Profiles preserve Cabinet truncation reasons and omitted-record counts. |
| License file becomes legal approval | Observations explicitly state that file presence is not legal compatibility verification. |
| One ecosystem owns the control plane | Root protocol and task graph are language-neutral; native tools remain authoritative. |
| Workspace conversion changes behavior | Standalone-versus-workspace canary comparisons precede promotion. |
| Static edges become dependency edges | Only verified protocol/build evidence may populate the executable dependency graph. |
| Generated artifacts enter commits | Candidate snapshots, sidecars, build outputs, locks generated during experiments, SBOMs, and caches remain outside source commits unless explicitly approved as governed fixtures. |

## Next step

Create the metadata/control-plane skeleton only, then choose one legally approved canary from each ecosystem and one cross-cell bridge project. For each canary:

1. complete license/source review;
2. normalize its descriptor;
3. pin an isolated toolchain;
4. run clean standalone build/test;
5. implement `task-request/v1` and `task-result/v1` adapters;
6. compare standalone and workspace-shard behavior;
7. publish only the exact support tuple proven by those checks.

Until those gates run, the correct claim is:

> The Cabinet contains 2,253 deterministic, source-bound **static compatibility observations** across 314 eligible Hosts. It contains zero runtime-verified compatibility relationships.
