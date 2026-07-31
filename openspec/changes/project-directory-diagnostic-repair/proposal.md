## Why

`project-directory-resource-state-v1` currently cannot produce a healthy, interpretable #91 diagnostic result because the runner evaluates its clean public workspace before installing the public lockfile dependencies. Lockfile provisioning is required before the candidate can re-enter any #91 screening plan.

## What Changes

- Provision public workspace dependencies after Pi and before the private evaluator, using the public lockfile and a fail-closed fixed Bun command.
- Record a stable redacted execution failure and skip evaluator invocation when provisioning fails.
- Preserve the public task behavior, related/irrelevant Practice pair, private evaluator/probe, and decision-rule meaning.
- Re-run one redacted three-condition diagnostic gate only after all repair validations pass.

## Capabilities

### New Capabilities

- `profile-diagnostic-workspace-provisioning`: Defines public lockfile dependency provisioning before profile diagnostic evaluation.

### Modified Capabilities

None. Existing evaluator-health and profile-diagnostic-runner requirements remain unchanged.

## Impact

- `src/benchmark/runner/pi/v2/` and focused tests; no candidate/evaluator/probe source changes are expected.
- The candidate remains in `incubator/`; no candidate snapshot, suite revision, formal manifest, record, or historical scratch result is modified.
- Private evaluator, oracle, calibration fixtures, and Practice text remain outside public task inputs, agent workspaces, issue text, and redacted summaries.
- Related issue: #126.
