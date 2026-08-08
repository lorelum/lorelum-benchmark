## Why

#98 supplies the track-agnostic kernel and only a static
`injection-calibration/v1` type shape. Practice candidates still lack the
versioned, private runtime contract that validates a condition declaration,
injects a declared Practice without materializing it into the agent workspace,
and binds the condition inputs for reproducible calibration. This work begins
now because #98 is merged; it must remain separate from #89's concrete
candidate authoring work.

## What Changes

- Add a Practice-specific `injection-calibration/v1` runtime contract that
  parses and validates declared baseline, oracle-Practice, irrelevant-Practice,
  and unavailable-retrieval conditions without changing kernel core semantics.
- Add a condition-scoped private runtime injection adapter. It supplies only
  the selected Practice to the declared execution boundary, never to the
  materialized workspace, public prompt, snapshot file list, or public trace.
- Bind the declared condition metadata, Practice version/hash, equal-length
  control measurement, and decision rule into a resolved Practice input that
  can be recalculated offline.
- Add a neutral profile fixture and offline tests for injection isolation,
  equal-length control validation, decision-rule declaration, and resolved
  input invalidation. No concrete #89 candidate is created or migrated.
- Extend generated-output hygiene so local Practice workspaces cannot be
  mistaken for candidate source; clean only generated local output belonging to
  this change and never modify #75 historical inputs.

## Capabilities

### New Capabilities

- `practice-injection-profile-runtime`: Private runtime parsing, validation,
  and condition-scoped injection for `injection-calibration/v1`.
- `practice-injection-profile-calibration`: Neutral offline verification of
  condition selection, isolation, equal-length control declarations, and
  decision-rule inputs.

### Modified Capabilities

- `benchmark-candidate-resolved-snapshot`: Bind declared Practice condition
  metadata and hashes into the resolved input for kernel-backed Practice
  candidates without exposing Practice text.

## Impact

- Expected code under `src/benchmark/kernel/profiles/injection-calibration/v1/`
  and focused benchmark tests.
- Expected private-only neutral fixture under `src/benchmark/kernel/fixtures/`;
  no files are added to `incubator/` or `suites/` in this change.
- `src/benchmark/snapshot.ts` may gain a profile-owned resolved-input hook.
- #89 / PR #97 remain responsible for concrete candidate fixtures and consume
  this contract only after their separate planning gate is satisfied.
