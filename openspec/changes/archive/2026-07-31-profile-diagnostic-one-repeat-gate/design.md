## Context

`profile-diagnostic-plan/v2` currently requires a repeat count divisible by
three so `cyclic-latin-square/v1` places every condition in every execution
position. That remains the rule for screening plans. After the #126 runner
repair, the requester approved a smaller re-admission check: one fresh,
redacted attempt for each of the three fixed conditions, used only to confirm
that a candidate can re-enter the normal #91 plan.

The public task behavior, related and irrelevant Practice cards, private
semantic and quality checks, candidate source/snapshot, model, prompt,
ten-minute budget, condition channels, and no-blind-review boundary remain
fixed. The one-repeat output is scratch-only and cannot become a formal
record or a comparative result.

## Goals / Non-Goals

**Goals:**

- Accept exactly one explicit re-admission plan shape: one candidate, three
  declared conditions, and one attempt per condition.
- Preserve identity binding, redaction, fresh public-only workspaces, and the
  existing post-Pi provisioning/evaluator flow.
- Persist the re-admission declaration and force its result to
  `diagnostic-only`, independent of raw outcomes.

**Non-Goals:**

- Do not loosen the balanced three-repeat rule for ordinary plans.
- Do not change candidates, public tasks, Practice cards, evaluators, oracle,
  scoring, source snapshots, model inputs, or formal-record behavior.
- Do not infer efficacy, permit expansion, or combine this scratch output with
  historical results.

## Decisions

### Explicit plan declaration rather than a repeat-count exception

The plan will require `execution_gate.kind: one-repeat-re-admission` before
it accepts `repetitions: 1`. The declaration binds one candidate, its
candidate identity, the parent three-repeat plan identity, and the intended
block. It rejects any other non-balanced count, multiple candidates, or
missing/invalid gate metadata.

This avoids treating a shortened screening plan as a normal plan. Allowing
any `repetitions: 1` plan was rejected because it would silently weaken the
pre-registered balance contract.

### Reuse scheduling and runner execution

The existing schedule builder already produces one of every condition in a
block. The gate reuses it for one block, retaining redacted planned and actual
order. It changes no Pi argument, Practice payload, workspace creation,
provisioning, evaluator, or evaluator-health semantics.

### Gate results are non-promotable

The report records the gate declaration and always emits
`conclusion_grade: diagnostic-only` for the gated candidate and overall
result. Raw semantic, Practice observation, evaluator-health, and joint-pass
counts remain visible as diagnostic evidence, but the runner never emits a
directional screen or expansion signal for this mode.

## Risks / Trade-offs

- [One repeat is mistaken for a comparison] -> explicit gate metadata and
  forced `diagnostic-only` conclusion are persisted and tested.
- [A generic plan bypasses the balance requirement] -> reject every
  non-multiple-of-three repeat count without the exact gate declaration.
- [Gate changes agent-visible inputs] -> reuse the normal runner path and
  test identity/redaction boundaries.
- [Repair output is mixed with history] -> scratch output records the active
  runner source identity externally and is not replayed into historical
  summaries.

## Migration Plan

1. Strictly validate this change and create the initial OpenSpec-only PR for
   #128.
2. Record the confirmed re-admission boundary in #128, this design, and
   `tasks.md` before implementation.
3. Implement plan validation/report downgrading and focused tests on this
   same branch and PR.
4. Run focused tests, `bun run validate`, strict validation, and a
   public/private audit.
5. Run one authorized redacted gate only after those checks pass. Do not
   create a formal manifest or record.

## Open Questions

None. The requester confirmed this is a diagnostic re-admission check, not a
replacement for the #91 balanced three-repeat screen.
