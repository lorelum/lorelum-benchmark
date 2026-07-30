## Context

The profile diagnostic runner currently processes each candidate in a fixed
condition batch and persists redacted scratch summaries. It already validates
candidate identity, resolves condition-scoped private payloads, and separates
semantic outcome, Practice observation, and evaluation health. Issue #116
adds pre-execution scheduling and analysis boundaries without changing those
existing meanings or creating a formal benchmark run.

## Goals / Non-Goals

**Goals:**

- Make the execution plan reproducible and auditable before any model call.
- Keep the three declared conditions equally represented in every repeat block
  while separating the plan seed from provider model parameters.
- Report raw, stratified outcomes without dropping, relabeling, or silently
  excluding unhealthy, incomplete, or indeterminate attempts.
- Bind conclusion language to the amount and kind of evidence actually
  collected.

**Non-Goals:**

- Modify candidate sources, Practice cards, controls, private evaluators,
  calibration, public tasks, starter inputs, snapshots, or historical scratch
  outputs.
- Add provider sampling seeds, assert that scheduling removes model
  randomness, call a model, create a formal run manifest or record, or make a
  causal, product, retrieval, or generalization claim.

## Decisions

### Plan first, execute from the plan

The runner will create a complete immutable-in-practice diagnostic plan before
it prepares a workspace or invokes Pi. The plan groups attempts by candidate
and resolved `profile_input_hash`; each repeat block contains exactly one of
each declared executable condition. It records plan seed, schedule algorithm
identifier/version, intended order, source commit, snapshot ID, and profile
input identity. Results refer back to that plan and record actual order rather
than regenerating an order while executing.

The plan seed is a scheduling input only. It never appears as a provider model
parameter or as a claim that model sampling is deterministic. A fixed global
condition order is rejected because it confounds condition with execution
position. Selecting a particular balanced permutation algorithm is deferred to
the planning confirmation so it can be pre-registered with its minimum repeat
requirements.

### Redacted schedule and identity-bound results

Schedules and results contain condition IDs and existing redacted Practice
identity metadata only. They never contain Practice text, private paths,
evaluator/oracle content, or agent workspace paths. A schedule cannot be used
with a different candidate identity, source commit, snapshot ID, or profile
input hash; mismatch is an auditable invalid-plan result, not a reordered or
silently regenerated attempt.

### Stratified descriptive analysis

The report retains the planned count as the denominator for every condition
and block. It presents raw `joint_pass` proportions and the oracle-minus-
baseline and oracle-minus-irrelevant-practice differences, alongside semantic,
each Practice observation state, and evaluation-health status. Non-health,
incomplete, and `indeterminate` entries remain visible in their planned
denominators and status counts; they cannot become `not-observed` or be
excluded from a comparison.

The report emits a diagnostic or uncertain conclusion whenever the preplanned
schedule is incomplete, any result is unhealthy, calibration is not valid, or
the planned analysis cannot be applied. Three repeats may only support a
candidate-level directional screen. A reproducible-direction statement needs
the pre-registered number of independent candidates and uncertainty display;
causal or generalized claims require separately pre-registered estimation and
uncertainty rules.

## Risks / Trade-offs

- [An unbalanced or unrecorded schedule creates order confounding] -> reject
  the plan before execution and test reconstruction, membership, and balance.
- [Seed is mistaken for a provider parameter] -> use schedule-specific field
  names and test that no model invocation field receives it.
- [Unhealthy outcomes disappear from descriptive rates] -> derive every
  denominator from planned attempts and test each exceptional state.
- [Private material leaks through schedule metadata] -> reuse redacted runtime
  trace metadata and add schedule/report leakage tests.
- [Small samples are presented as efficacy evidence] -> make conclusion grade
  a required report field with explicit downgrade conditions.

## Migration Plan

1. Strict-validate this OpenSpec change and create the OpenSpec-only PR for
   issue #116.
2. Record planning confirmation in issue #116, this design, and `tasks.md`:
   observable behavior, baseline defect and discrimination, relevant and
   equal-length irrelevant controls, private acceptance, immutable inputs,
   model/prompt/budget, blind-review boundary, schedule algorithm, and
   evidence thresholds.
3. Implement plan construction, validation, redacted persistence, reporting,
   and focused tests on this same branch and PR.
4. Run leakage audit, focused runner tests, `bun run validate`, and strict
   OpenSpec validation. Do not call Pi or a model unless the lifecycle gate is
   satisfied; do not create a formal record in this change.

Rollback is a revert of the runner and plan/report contract. Existing scratch
results remain historical and are neither rewritten nor merged with a run
using this plan.

## Open Questions

- Which pre-registered block permutation or cycle algorithm provides the
  required balance, and what minimum repeat count makes it valid?
- How many independently designed candidates and which uncertainty display are
  required before the report can use the reproducible-direction grade?
- Which already-calibrated candidates, immutable source commits, model,
  prompt, tools, budget, and blind-review boundary will form the first
  dry-run-only plan?
