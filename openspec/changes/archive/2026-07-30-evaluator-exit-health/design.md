## Context

The profile diagnostic runner invokes a private evaluator after a Pi attempt
and scans stdout for a structured result. It currently records that result as
`evaluated` without considering the evaluator command's exit result. A
partially executed evaluator can therefore contribute semantic, Practice, and
joint-pass fields even though the evaluator environment or test command failed.

This change is limited to the unfrozen Practice diagnostic path. It preserves
the independent semantic, Practice observation, and evaluator health contract
introduced by #114, without modifying any candidate source, Practice text,
private probe, historical scratch artifact, or model execution input.

## Goals / Non-Goals

**Goals:**

- Treat a structured evaluator result as healthy only when its process exited
  successfully.
- Preserve all successful structured semantic failures and Practice
  observations as `evaluated`; health must not be inferred from either value.
- Record evaluator-process failures as a redacted non-healthy result with no
  derived comparison fields.
- Make evaluator-only replay report unavailable historical workspaces as
  diagnostic uncertainty rather than condition evidence.

**Non-Goals:**

- Changing evaluator semantics, Practice observation rules, calibration,
  candidate public material, Pi prompts, models, or budgets.
- Retrying, installing dependencies into, or otherwise mutating a historical
  scratch workspace during replay.
- Calling a model, creating a formal record, or claiming a Practice effect.

## Decisions

### Exit success is a prerequisite for `evaluated`

The runner SHALL parse structured output only after confirming that the
evaluator command neither timed out nor returned a nonzero exit code. A normal
exit with an invalid or missing result remains `invalid-output`; a timeout,
launch failure, or nonzero exit is recorded as `execution-failed` using a
stable, redacted reason code. In either failure case the entry MUST omit
semantic, Practice observation, and joint-pass fields.

Using the existing `execution-failed` state avoids a breaking summary enum
change while accurately expressing that no complete evaluator execution was
available. Treating nonzero output as `invalid-output` was rejected because
the output can be well formed yet not trustworthy; accepting it was rejected
because it makes evaluator health depend on stdout rather than process
completion.

### Preserve evaluator output only as private scratch diagnostics

The runner may retain evaluator stdout and stderr in ignored scratch artifacts
for debugging. The summary stores only a stable error category such as
`evaluator-exit-nonzero`, without a private path, command output, Practice
text, or evaluator assertion.

### Historical replay is classification-only

An evaluator-only replay does not reconstruct the original model run. It may
reclassify a usable historical candidate workspace under the current evaluator
contract, but an unavailable dependency or evaluator failure is a non-healthy
replay entry and blocks a condition comparison. The replay is not repaired by
installing dependencies or rerunning Pi because either action changes the
historical execution context.

## Risks / Trade-offs

- [A legitimate evaluator intentionally uses a nonzero exit for a semantic
  failure] -> Candidate evaluators must emit a complete result and exit zero
  for any evaluable semantic or Practice outcome; tests document this
  contract.
- [A nonzero exit hides a useful partial result] -> Preserve private scratch
  logs for diagnosis, but do not expose or compare the partial result.
- [Old scratch workspaces lack dependencies] -> Report non-healthy replay
  entries and keep the #91 admission decision uncertain; do not mutate the
  workspace.

## Migration Plan

1. Create and strict-validate this OpenSpec-only PR for #118.
2. Record the required planning confirmation in #118 and this design before
   editing runner code.
3. Add exit-health handling and focused tests, then run runner tests and
   `bun run validate`.
4. Run an evaluator-only replay only where historical workspaces remain
   executable; record unavailable workspaces as non-healthy diagnostics.

Rollback is a revert of the runner and focused-test change. No candidate,
formal record, or frozen revision is mutated.

## Planning Confirmation

The requirements owner confirmed after the OpenSpec-only PR:

- Candidate observable behavior, Practice conditions, baseline discrimination,
  private semantic/quality acceptance, starter and snapshot identity, and
  model, prompt, budget, and blind-review boundaries remain unchanged.
- `execution-failed` is the non-health state for evaluator launch, timeout,
  and nonzero-exit failures. A non-healthy evaluator contributes no semantic,
  Practice observation, or joint-pass result.
- Historical replay is evaluator-only. It must not install dependencies,
  mutate a workspace, rerun Pi, call a model, create a formal record, or
  support a #91 condition comparison when unavailable.
