## Why

The repaired profile diagnostic runner needs one three-condition re-admission
attempt to verify evaluator health without spending the nine model calls
required by the normal balanced three-repeat plan. The existing scheduler
correctly rejects a one-repeat general diagnostic plan, but has no explicitly
bounded re-admission mode.

## What Changes

- Add an explicit `one-repeat-re-admission` plan mode that permits exactly one
  attempt for each declared diagnostic condition.
- Keep ordinary plans on the existing three-repeat cyclic-Latin-square rule.
- Force every one-repeat re-admission result to `diagnostic-only` and prohibit
  expansion eligibility or effect conclusions.
- Preserve candidate identity validation, redacted traces, and public/private
  workspace isolation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `profile-diagnostic-runner`: Allow a bounded one-repeat re-admission plan
  while preserving balanced screening requirements and conclusion limits.

## Impact

- `src/benchmark/runner/pi/v2/profile-diagnostic-plan.ts` and its focused
  tests.
- The profile diagnostic runner's redacted scratch summary contract.
- No candidate, Practice, evaluator, snapshot, suite revision, formal record,
  model setting, or public task input changes. Related issue: #128.
