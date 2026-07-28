# Benchmark Candidate Workspace Kernel

The benchmark candidate workspace kernel creates a reproducible agent-facing
workspace from a declared candidate or future task revision. It is a
track-agnostic mechanism: the core handles materialization, isolation,
hashing, and offline calibration orchestration; profiles define track-specific
contract shapes.

## Versions and Compatibility

Candidates that use the kernel declare:

```yaml
kernel:
  core: v1
  profile: injection-calibration/v1
  materializer_kind: react-vite
```

`kernel.profile` is the authoritative track key. Directory location and an
ambient dependency tree are not part of the contract.

| Core | Profile | Materializer kind | Intended use |
| --- | --- | --- | --- |
| `v1` | `injection-calibration/v1` | `react-vite` | Practice injection candidates |
| `v1` | `treatment-comparison/v1` | `react-vite` | Future Skill comparison revisions |

New stacks are added as materializers under the existing compatible core. A
new core version is required only when the core contract changes. Frozen tasks
remain pinned to their recorded core and snapshot; the kernel never
re-materializes historical revisions.

## Artifact Rule

The repository starter contains only reproducible source inputs: manifests,
lockfiles, and source. It must not contain installed dependencies, build
output, browser-test output, run workspaces, logs, or evidence indexes.

`node_modules/`, `dist/`, `test-results/`, `playwright-report/`, and `.vite/`
are generated output. Validation rejects generated files in a starter; the
materializer omits them; resolved snapshots exclude them. The materializer
declares `bun install` for the execution stage but does not run it while
materializing or snapshotting.

## Author Workflow

1. Create the candidate's public task and `public/starter/` source, with its
   private declaration and calibration materials kept under `private/`.
2. Declare a versioned `kernel` block. Choose the profile from the experimental
   model, not from the directory name.
3. Declare calibration roles as command argument arrays and expected outcomes.
   The commands remain candidate-owned; the core only invokes them and compares
   exit status with the declaration.
4. Materialize to a fresh or empty directory outside the candidate root, then
   audit, hash, and calibrate it. The kernel never clears a caller-provided
   directory:

```text
bun run src/benchmark/kernel/kernel.ts materialize <candidate> --output <workspace>
bun run src/benchmark/kernel/kernel.ts isolate <candidate> --output <workspace>
bun run src/benchmark/kernel/kernel.ts hash <candidate> --output <workspace>
bun run src/benchmark/kernel/kernel.ts calibrate <candidate> --output <workspace>
bun run src/benchmark/kernel/kernel.ts fixture-hash <source-directory>
```

### Versioned calibration fixture overlays

`injection-calibration/v1` candidates may declare `calibration_sets.manifest` in
`private/candidate.yaml`. The manifest is always
`private/calibration/sets.yaml`; it contains named `id` + `version` sets. A set
uses named trees: a root tree pins a registry `base.ref` and `sha256`, while
child trees use `extends` plus an overlay `path` and `sha256`. An overlay adds
files or explicitly replaces the same relative file; deletion is unsupported.

Registry bases live under `incubator/calibration-bases/` and contain a
version-local `base.yaml` that fixes `profile`, `materializer_kind`, and
`source: source`. A base version is immutable. Use `fixture-hash` for the
canonical source-directory digest after reviewing a new base or overlay.

The kernel rejects missing or incompatible bases, digest mismatches, escapes,
symbolic links, generated paths, ambiguous declarations, and inheritance cycles.
It resolves every declared set into a stable manifest and tree hash. Snapshot
v1 records the aggregate as `resolved.calibration_sets_hash`. Materialize and
isolate validate the same declaration; calibration roles receive only a
temporary private staged-tree manifest and a generated-output-free copy of the
public starter through the kernel. Calibration dependencies are installed only
in that private staging directory; agent-facing workspaces and candidate source
trees continue to contain public material only.

5. Generate and commit the candidate snapshot only after review. A snapshot
   binds the core hash, declaration, public starter input, and materialized
   public output. It does not expose private calibration material to agents.

## Review Guide

Use this decision sequence when reviewing a new kernel-backed candidate:

1. Does the declaration pin a known core, versioned profile, and materializer?
2. Is the profile appropriate for the stated calibration model?
3. Does the starter exclude generated output and avoid an ambient dependency
   tree?
4. Does materialization produce only public files and does isolation pass with
   the candidate's private paths?
5. Do declared calibration commands produce their expected exit statuses
   without the core interpreting domain semantics?
6. Does the reviewed resolved snapshot change exactly when the core,
   declaration, starter, or materialized public output changes?

## Reproduction

Use the committed source, lockfile, private declaration, and resolved snapshot
from the same revision. Materialize to a fresh local workspace, run the
offline calibration roles, then verify the snapshot. Do not insert Practice
cards, oracle material, evaluator configuration, or private calibration files
into the workspace or public prompt. Model calls, retrieval, blind evaluation,
and result records are outside this kernel workflow.
