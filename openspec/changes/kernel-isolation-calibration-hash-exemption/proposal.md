## Why

Issue #104 found that `core/v1` rejects legitimate kernel-backed candidates when
their private calibration fixtures retain reproducible copies of files already
materialized from the public source. The current hash-only comparison cannot
distinguish those public-equivalent fixture files from genuinely private data
copied into the agent workspace.

## What Changes

- Define a narrowly scoped isolation-audit exemption for public-equivalent files
  retained below a candidate's `private/calibration/` tree.
- Keep fail-closed path-segment, sensitive-name, and private-content hash checks
  for Practice cards, conditions, oracles, evaluators, and every other private
  asset.
- Add regression coverage for calibration-bearing candidates and the neutral
  fixture's real private-leak detection.

## Capabilities

### New Capabilities
- `kernel-isolation-calibration-equivalence`: Defines how `core/v1` distinguishes
  reproducible public-equivalent calibration source from private workspace leakage.

### Modified Capabilities
- None.

## Impact

- Affects `src/benchmark/kernel/core/v1/` and its kernel isolation tests.
- Consumes private calibration source only for auditing; it does not materialize
  private files, alter candidate snapshots, change Practice payload handling, or
  run models.
- Tracks and resolves #104 independently of the #89 candidate fixture chain.
