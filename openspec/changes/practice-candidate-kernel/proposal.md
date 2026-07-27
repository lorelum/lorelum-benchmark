## Why

Issue #98 is needed before #89 expands Practice candidates. Copying a complete React application, lockfile, calibration harness, and execution material for every candidate is reviewable once, but becomes redundant and difficult to audit across twenty candidates. The repository needs a versioned, reproducible authoring contract that shares only generic mechanics while preserving each candidate's public task and private evaluation boundary.

## What Changes

- Add a versioned Practice candidate kernel contract for a shared React/Vite/TypeScript/Playwright source template plus candidate-specific public and private overlays.
- Add declarative candidate metadata and a shared calibration/isolation audit entry point, without merging candidate-specific Practice, oracle, or quality probes into global rules.
- Extend candidate snapshot verification to bind the kernel version/hash, overlay inputs, and resolved public agent input.
- Validate the contract using the two confirmed #89 topics only after this change's planning gate; do not implement Pi batch execution or create records.

## Capabilities

### New Capabilities

- `practice-candidate-kernel`: Versioned shared source and candidate overlay contract that materializes a candidate's public agent input without exposing private material.
- `practice-candidate-calibration`: Declarative registration and shared offline orchestration for candidate-owned reference, responsibility-equivalent, public starter, and anti-pattern calibration cases.
- `practice-candidate-resolved-snapshot`: Reproducible snapshot contract binding source kernel, overlays, and materialized public input.

### Modified Capabilities

- `login-practice-probe-fixture`: Define that existing #75 materials remain immutable historical input and are not required to migrate to the new kernel.

## Impact

- New versioned source and validation code will be added under `src/benchmark/` and candidate assets under `incubator/practice-injection/` after the planning gate.
- `src/benchmark/snapshot.ts` and its focused tests may gain a candidate-specific resolved-input verification path; existing task and #75 snapshot semantics must remain compatible.
- No model invocation, retrieval, run workspace, formal record, suite revision, or #90 batch execution is part of this change.
