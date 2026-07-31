## Context

`preflightPiAndModel` currently invokes Pi with only `--print`, `--no-session`,
and the configured model ID, from the repository root. Pi therefore discovers
project context and keeps its normal tool set. A direct reproduction completed
successfully after 47 seconds but also changed an OpenSpec task checkbox. The
profile diagnostic gate classifies that valid response as unreachable because
its 30-second probe deadline has already elapsed.

The affected candidate remains in `incubator/`; neither it nor a frozen suite
revision has produced a formal record. The pending re-admission output is
scratch-only. Pi must retain the runtime credential it needs, but it must not
receive public project context, private material, evaluator inputs, or write
capabilities during availability probing.

## Goals / Non-Goals

**Goals:**

- Perform a bounded model availability probe without Pi tools, project context,
  Skills, extensions, or session persistence.
- Give the isolated probe enough bounded time to distinguish normal model
  startup from a genuinely unavailable command or provider.
- Preserve fail-closed, redacted failure classification and leave no filesystem
  side effects from the probe.

**Non-Goals:**

- Do not change the configured model, model prompt/budget for diagnostic
  attempts, candidate identity, Practice injection, evaluator, oracle, score,
  snapshot, treatment, environment, formal manifest, or record behavior.
- Do not use the repair to claim a candidate or Oracle result, or complete
  #129's gate without a later complete scratch execution.

## Decisions

### Use an explicitly restricted Pi invocation

The probe will keep `--print` and `--no-session`, and add Pi's flags for no
tools, no context files, no Skills, and no extensions. Its prompt remains a
small availability response rather than task work. This is preferable to
trusting the current repository because preflight runs before the runner has
created a controlled candidate workspace, and a future repository context must
not change availability semantics.

### Retain a bounded timeout with an isolated-probe allowance

The implementation will use a finite preflight deadline that is larger than
the observed 47-second normal response and document it as a probe-only bound;
it does not alter the ten-minute candidate-attempt budget. An unlimited wait
was rejected because the runner must fail closed when a provider is unavailable.
The focused tests will make the deadline and timeout classification explicit.

### Test arguments and effects without a live model

Focused tests will use a controlled Pi stand-in to capture the probe arguments,
write a sentinel only if tools/context were available, and simulate both a
normal delayed success and a timeout. This proves isolation deterministically
without creating a model call, candidate workspace, artifact, or record.

## Risks / Trade-offs

- [A slow but healthy provider exceeds the new bound] -> retain a bounded,
  observed-safe allowance and classify the result as not executable rather than
  a candidate failure.
- [A future Pi release changes restriction flags] -> lock the expected command
  contract in focused tests and retain the pinned runtime version in existing
  manifests.
- [The probe still sees credentials] -> it receives only the inherited runtime
  environment needed for provider authentication; no workspace, task, private,
  evaluator, or Practice input is passed.
- [Timeout termination behaves differently across platforms] -> test the
  reported fail-closed status on the supported runner path and keep the timeout
  finite; do not claim the probe completed when its deadline was exceeded.

## Migration Plan

1. Add the contract tests and restricted preflight arguments on a new runner
   change branch.
2. Run focused Pi v2 tests, `bun run validate`, strict OpenSpec validation, and
   `git diff --check`.
3. After review and merge, use the repaired runner to retry #129's existing
   scratch-only one-repeat gate. Do not create a formal record.

## Open Questions

None. The requested execution boundary remains the existing model, prompt, and
ten-minute candidate budget; only the preflight's own isolation and bounded
deadline change.
