## Why

Issue #116 identifies that the profile diagnostic runner executes conditions in
a fixed batch order and reports only a strict joint-pass lead. That design
confounds condition with execution order and overstates what a small local
comparison can establish.

## What Changes

- Add a pre-execution, seed-derived block schedule for every
  candidate x profile-input identity, with one baseline, oracle-practice, and
  irrelevant-practice attempt per repeat block.
- Record the pre-registered schedule, plan seed, actual execution order,
  input identity, source commit, and snapshot in redacted scratch results.
- Add a stratified diagnostic report that retains planned attempts as every
  denominator and reports joint pass, semantic, Practice observation, and
  evaluation health independently.
- Add conclusion-grade rules that limit three repeats to directional screening
  and prevent causal or generalization claims from diagnostic output.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `profile-diagnostic-runner`: define balanced condition scheduling,
  pre-registered diagnostic reporting, failure retention, and conclusion
  boundaries for profile-aware local diagnostic runs.

## Impact

- Affected code: `src/benchmark/runner/pi/v2/profile-diagnostic-runner.ts`
  and its focused tests, plus any versioned diagnostic-summary contract needed
  by that runner.
- Affected data: ignored `scratch/` diagnostic results gain schedule and
  report fields; no existing scratch result, candidate input, Practice card,
  task revision, formal manifest, or formal record is modified.
- Verification: focused scheduling, reproducibility, balance, identity,
  denominator, redaction, and report-boundary tests; OpenSpec strict
  validation and `bun run validate`. Model and Pi execution remain out of
  scope until all lifecycle and planning gates are complete.
- Traceability: GitHub issue #116.
