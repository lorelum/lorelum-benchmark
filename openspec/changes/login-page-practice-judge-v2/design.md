## Context

The v1 login-page rubric was calibrated as a four-dimensional 100-point score:
API boundary, submission state, form experience, and UI/UX. The #137 pilot
showed that the latter dimensions and literal source matching dominate the
observed differences, while all six runs passed the API boundary at 30/30.
The pilot's Pro and Flash Oracle deductions were caused by equivalent syntax,
not different behavior.

Lorelum's Practice hypothesis is narrower: a relevant, precisely injected
Practice should improve adherence to the API/page responsibility boundary.
The benchmark must therefore keep functional completion and general product
quality as independent observations and use a Practice-specific score for the
effect comparison.

## Goals / Non-Goals

**Goals:**

- Preserve v1 as an immutable historical scorer and keep its hashes valid.
- Define a v2 score whose four criteria map directly to the layered API
  Practice: component isolation, domain-operation delegation, boundary
  translation, and raw-response containment.
- Accept behaviorally equivalent syntax, including intermediate boolean
  bindings, brace-form guards, alternate state mechanisms, aliases, and
  helper names.
- Return `indeterminate` for unresolved or ambiguous static analysis instead of
  treating it as either success or negative evidence.
- Calibrate reference, equivalent, anti-pattern, and ambiguity fixtures before
  any model run.

**Non-Goals:**

- No rewrite of v1 rubric, v1 scorer, v1 calibration set, v1 snapshot, or pilot
  summaries.
- No claim that the v2 score validates Lorelum retrieval or proves causal
  Practice effectiveness.
- No inclusion of functional, visual, or general form-quality dimensions in
  the Practice-effect score; those remain separate result fields.
- No real model call, formal record, or suite promotion in this change.

## Decisions

### Practice-specific dimensions

Use four criteria totalling 100 points:

| Criterion | Points | Evidence |
| --- | ---: | --- |
| component-transport-isolation | 30 | The component does not call transport or inspect raw status/body. |
| domain-operation-delegation | 25 | Every form submit path awaits an invoked operation outside the component. |
| boundary-response-translation | 30 | The invoked boundary owns transport and maps expected auth failure into a domain result/error. |
| raw-response-containment | 15 | Raw response/body values do not flow back into component state or return values. |

These weights represent the Practice's responsibilities rather than UI polish.
The existing Playwright semantic result remains the hard functional gate.

### Evidence engine

Use TypeScript AST traversal and a resolved local/alias module graph. Resolve
relative extensions, index modules, and declared `tsconfig` path aliases. Track
bindings through intermediate variables and block statements rather than
matching a source spelling. If a relevant import or data-flow edge cannot be
resolved, emit an audit reason and `indeterminate`; do not award a full score.

The v2 judge may reuse the public result contract (`judge-result/v1`) as a
soft-quality sidecar, but the rubric/scorer version and criterion IDs must be
explicitly v2-bound. A future stochastic JudgeAgent can consume the same
criteria, but the local calibration scorer remains deterministic.

### Calibration matrix

The v2 matrix includes:

- reference implementation;
- equivalent implementation with `disabled` through an intermediate expression;
- equivalent implementation with brace-form duplicate-submit guard;
- equivalent implementation using an alternate pending-state mechanism;
- anti-pattern with component transport/raw response handling;
- ambiguous or unresolved module graph, expected `indeterminate`.

The matrix must check criterion-level evidence, not only total score. No v2
comparison may run unless all equivalent cases are accepted, the anti-pattern
is rejected, and ambiguity is fail-closed.

### Reporting and migration

Pilot summaries must report semantic outcome, v2 Practice score/state, raw
criterion evidence, and execution health separately. v1 summaries remain
interpreted with v1 and are not recomputed. A future pilot must explicitly
select v2 in its frozen plan and use `joint_pass` only as a derived binary
field, never as a replacement for the raw Practice score.

## Risks / Trade-offs

- [AST analysis still has unsupported language features] -> classify the
  relevant result as `indeterminate`, preserve the reason, and add a fixture
  before expanding support.
- [A narrower score misses useful UI improvements] -> retain semantic/browser
  results and optional general-quality fields, but keep them out of the
  Practice-effect endpoint.
- [v2 scores are not numerically comparable to v1] -> bind every sidecar to a
  rubric hash/version and never compare totals across rubric versions.
- [A deterministic scorer is not an LLM Judge reliability study] -> label v2
  calibration as offline measurement validation; require a separate blinded
  provider/panel study for JudgeAgent claims.
