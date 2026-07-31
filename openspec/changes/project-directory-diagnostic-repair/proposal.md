## Why

`project-directory-resource-state-v1` currently cannot produce a healthy, interpretable #91 diagnostic result: its oracle evaluator exits nonzero while the two controls report indeterminate Practice observations. Repairing that candidate's validation boundary is required before it can re-enter any #91 screening plan.

## What Changes

- Diagnose the candidate-specific mismatch between public implementation, private evaluator/probe, calibration fixtures, and the declared runtime closure without exposing private material.
- Repair only verified candidate or evaluator defects while preserving the public task behavior, related/irrelevant Practice pair, and decision-rule meaning.
- Regenerate the candidate snapshot and create a new immutable execution-plan identity after successful calibration.
- Re-run one redacted three-condition diagnostic gate only after all repair validations pass.

## Capabilities

### New Capabilities

- `project-directory-candidate-repair`: Defines the failure classification, repair, recalibration, snapshot, and re-admission requirements for the project-directory Practice candidate.

### Modified Capabilities

None. Existing evaluator-health and profile-diagnostic-runner requirements remain unchanged.

## Impact

- Candidate-scoped files under `incubator/practice-injection/project-directory-resource-state-v1/`, plus only necessary tests or versioned evaluator support in `src/benchmark/`.
- The candidate remains in `incubator/`; no suite revision, formal manifest, record, or historical scratch result is modified.
- Private evaluator, oracle, calibration fixtures, and Practice text remain outside public task inputs, agent workspaces, issue text, and redacted summaries.
- Related issue: #126.
