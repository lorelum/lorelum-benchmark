## Why

Issue #122 is closed and both `injection-calibration/v1` candidates now pass the repaired evaluator runtime calibration locally. Issue #91 remains blocked until endpoint, isolated-calibration, and one-repeat diagnostic gates are evidenced without changing candidate source, public task input, or historical results.

## What Changes

- Define the #91 gate order: Pi/model preflight, isolated calibration for both candidates, then a one-repeat three-condition diagnostic.
- Reconcile the diagnostic runner with its checked-in, plan-only `balanced-diagnostics-v1` contract so candidate-local repetition settings cannot change the denominator.
- Produce only redacted `scratch/` evidence; preserve health, semantic, Practice-observation, and joint-pass states without causal claims.

## Capabilities

### New Capabilities

- `candidate-expansion-admission`: Gated prerequisite and evidence rules before #91 can expand to three repeats per condition.

### Modified Capabilities

None. The runner must conform to its existing published requirements; this change does not alter them.

## Impact

- Reconciles `src/benchmark/runner/pi/v2/` with the existing versioned execution plan and tests.
- Uses existing private calibration/runtime inputs only in isolated workspaces; summaries exclude Practice text, evaluator/oracle material, private paths, and workspace paths.
- Creates no formal manifest, record, suite revision, or candidate-source change. Related issue: #91.
