## Why

The #90 diagnostic summaries predate the v2 Practice observation contract and
therefore conflate a completed task with absent Practice evidence. Before #91
can expand either candidate, the available historical workspaces need a
redacted evaluator-only reinterpretation that preserves the original v1
outputs and makes replay availability explicit.

## What Changes

- Add a replay-only diagnostic workflow for available #90 candidate workspaces
  using the current v2 evaluator contract, without invoking a model or
  materializing any agent workspace content outside its existing location.
- Define a versioned `profile-diagnostic-summary/v2` report that retains the
  source commit, historical snapshot identity, redacted Practice identity,
  planned denominator, separate evaluator result dimensions, and stable audit
  reasons for each attempted replay.
- Require an explicit, bounded #91 entry conclusion: directional signal may be
  expanded, candidate/Practice/probe adjustment is required, or evidence is
  indeterminate. The conclusion applies only to the two #90 candidates and
  their existing historical inputs.
- Preserve v1 scratch summaries and prohibit combining their samples with
  future #91 executions.

## Capabilities

### New Capabilities

- `historical-practice-observation-replay`: defines replay-only validation of
  historical profile diagnostic workspaces, redacted v2 reporting, and the
  bounded expansion-entry decision.

### Modified Capabilities

None.

## Impact

- Runner: the profile diagnostic runner and focused tests may gain an
  evaluator-only replay entry point or helper.
- Diagnostics: ignored `scratch/` receives a new redacted v2 summary alongside
  unchanged v1 historical summaries.
- Candidate scope: only `profile-update-command-boundary-v1` and
  `project-directory-resource-state-v1` historical #90 workspaces are read;
  no candidate source, Practice card, condition, starter, snapshot, or formal
  benchmark record changes.
- Verification: current evaluator/probe calibration, focused runner tests, and
  public/private leakage auditing are required. No model, Pi execution,
  retrieval, formal manifest, or record is created.
