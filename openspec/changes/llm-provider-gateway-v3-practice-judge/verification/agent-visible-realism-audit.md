# Agent-visible realism / test-awareness audit

Date: 2026-08-22

## Scope

Reviewed only material intended to be visible to the coding agent:

- `public/task.md`
- `public/starter/`
- the runtime agent-visible declaration in `private/execution/tool-policy.yaml`
- the git history that the diagnostic runner materializes in the workspace

No evaluator, oracle, Practice card, condition configuration, or scoring logic was used as agent-visible evidence.

## Method and result

1. Searched the public task and starter for explicit experiment/evaluation vocabulary (`benchmark`, `candidate`, `experiment`, `judge`, `rubric`, `oracle`, `treatment`, `condition`, `baseline`, `control`, `fixture`, `scaffold`, `probe`), ignoring unrelated substrings such as `cache-control`.
2. Inspected public comments for language addressed to a task candidate rather than a repository maintainer.
3. Inspected all configured git history messages for scaffold/benchmark/task-generation framing.
4. Confirmed the workspace policy provides a clean copy containing only `public/task.md` and `public/starter/`; `private/` is prohibited from model input.

## Changes made

- Replaced the public Nebula stub comment that said the “candidate” must implement its wire contract with neutral maintainer language describing the protocol difference.
- Synchronized the private `candidate-v3` calibration foundation copy of that stub.
- Renamed configured git history messages from scaffold/awaiting-wiring language to ordinary initialization and provider-integration history.

## Assessment

After the changes, the public materials contain no direct benchmark, judge, rubric, oracle, treatment, condition, baseline, control, fixture, scaffold, probe, or candidate framing.

The remaining awareness risk is medium but expected for a well-specified engineering exercise: the public API specification and integration-test suite are exhaustive, and the repository is intentionally small. The presence of tests and a request to run them is not treated as invalid test-awareness; they are normal engineering acceptance criteria. The task does not disclose hidden evaluation criteria or request benchmark-oriented behavior.

No public tests or observable requirements were weakened to reduce this risk.