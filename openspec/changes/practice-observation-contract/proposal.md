## Why

Issue #114 showed that the current Practice result contract can turn an
equivalent implementation into `practice_probe=fail`, then report the whole
evaluation as failed. The direct trigger was a reference-path-sensitive import
check, but the underlying defect is that semantic completion, Practice evidence,
and evaluator health are represented as one binary outcome.

## What Changes

- Define an independent Practice observation result with `observed`,
  `not-observed`, `indeterminate`, and `not-run` states.
- Require diagnostics to retain semantic outcome, Practice observation, and
  evaluator/execution status as separate fields. A valid evaluator result may
  not be labeled `evaluation-failed` solely because Practice evidence was not
  observed.
- Require Practice probes to classify responsibility-equivalent implementations
  by resolved program identity rather than path strings, names, or reference
  layout; unsupported analysis must be `indeterminate` rather than a false
  negative.
- Make this the required contract for every current and future
  Practice-injection candidate. Trial it first in the two unfrozen
  `injection-calibration/v1` candidates named in #114, including their private
  calibration matrices.
- **BREAKING**: the profile diagnostic summary and the two candidate evaluator
  outputs replace the binary `practice_probe` result with the independent
  Practice observation contract.

## Capabilities

### New Capabilities

- `practice-observation-diagnostics`: defines the profile diagnostic result
  contract, state mapping, derived analysis fields, and redacted reporting.

### Modified Capabilities

- `practice-benchmark-boundaries`: strengthens the separation between semantic
  completion, Practice evidence, evaluator health, and calibration of
  equivalence-preserving probes.

## Impact

- Documentation: `docs/PRACTICE_BENCHMARK_GUIDE.md` and its corresponding
  OpenSpec capability.
- Runner: `src/benchmark/runner/pi/v2/profile-diagnostic-runner.ts` and its
  focused tests.
- Candidates: this contract governs all current and future Practice-injection
  candidates. `profile-update-command-boundary-v1` and
  `project-directory-resource-state-v1` are the only candidate sources changed
  in this implementation, including their private evaluators, calibration
  manifests, snapshots, and tests.
- Validation: the two candidate calibration matrices, runner tests,
  public/private leakage audit, `bun run test:pi:v2`, `bun run validate`, and
  evaluator-only replay of existing #90 scratch workspaces when available.
- Scope: #114. No model run, formal record, task promotion, or change to
  Practice cards, public task material, conditions, model, prompts, or budgets.
