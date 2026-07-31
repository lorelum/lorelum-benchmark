## Why

Pi 0.80.10 can return a valid response to the configured model after more than
the runner's fixed 30-second preflight window. Its current preflight also
starts a full coding agent in the repository root, allowing an availability
probe to load project context and mutate files before any diagnostic workspace
exists.

## What Changes

- Make profile-diagnostic Pi preflight a minimal, read-free and tool-free model
  probe that cannot load project context, extensions, Skills, or write tools.
- Replace the observed-insufficient fixed deadline with a bounded timeout that
  permits the configured model's normal startup response while still failing
  closed for unavailable runtimes or providers.
- Add regression coverage for isolated invocation flags, timeout classification,
  and the absence of probe side effects.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `profile-diagnostic-runner`: Require a bounded and side-effect-free Pi/model
  preflight before profile diagnostic execution.

## Impact

- `src/benchmark/runner/pi/v2/preflight.ts` and its focused tests.
- Profile-diagnostic execution preflight only; no candidate, Practice,
  evaluator, score, snapshot, treatment, environment, formal manifest, or
  record change.
- Related issue: #130. The later #129 gate remains scratch-only and
  diagnostic-only.
