## Why

The profile diagnostic runner currently accepts a structured evaluator result
from stdout without checking whether the evaluator process completed
successfully. An evaluator can therefore emit partial JSON, then fail because
of a missing dependency or a failed test command, and still be reported as
`evaluated`. This makes an unhealthy evaluation appear eligible for a Practice
condition comparison.

This was found during the evaluator-only replay required before #91 expands
candidate and Practice samples. The runner must preserve the distinction
between a valid semantic/Practice result and a failed evaluator process before
those results can be interpreted.

## What Changes

- Require a profile diagnostic evaluator process to exit successfully before
  its structured output can produce `evaluation_status=evaluated`.
- Classify evaluator launch, timeout, or nonzero-exit failures as non-healthy
  diagnostic results and do not derive semantic, Practice observation, or
  `joint_pass` from their stdout.
- Add focused coverage for structured output followed by evaluator failure,
  missing output, and a successful structured evaluator result.
- Define the evaluator-only replay consequence: failed historical workspaces
  remain diagnostic and cannot support a #91 condition comparison.

## Capabilities

### New Capabilities

- `profile-diagnostic-evaluator-health`: defines how the profile diagnostic
  runner classifies evaluator process completion independently of semantic and
  Practice observation output.

### Modified Capabilities

- `practice-benchmark-boundaries`: requires a diagnostic result to come from
  a successfully completed evaluator process before it counts as healthy or
  contributes to condition-level evidence.

## Impact

- Runner: `src/benchmark/runner/pi/v2/profile-diagnostic-runner.ts` and its
  focused tests.
- Documentation and candidate result interpretation: Practice diagnostic
  summaries and evaluator-only replays used by #117.
- Scope: #118. This change does not alter candidate tasks, Practice cards,
  private probes, model calls, formal records, or frozen task revisions.
