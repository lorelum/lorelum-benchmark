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

## Review-driven revision (2026-08-05)

An external review confirmed the v2 direction (four Practice responsibilities,
excluded UI/form dimensions, fail-closed ambiguity) but found the implementation
systematically mis-scores Practice-compliant structures and misses the most
critical leak patterns. The revision below stays within this change (judge v2 and
its calibration); it does not change the task, starter, or runner wiring.

### Data-flow evidence replaces name/source matching

- `component-transport-isolation`: a page import is transport evidence only when
  the resolved module performs transport (contains a `fetch` call), the page
  actually invokes a binding from it (call edge), and the module is neither the
  resolved submit boundary (boundaries may own transport; aligned with
  `verify-layering.ts`) nor a domain-translating module.
- `rawReads` counts only `.status`/`.body`/`.rawResponse` reads whose receiver is
  a transport-result identifier (awaited `fetch` or awaited transport-adapter
  call). Non-response objects such as `document.body` are excluded.
- `raw-response-containment` recursively checks return expressions, including
  nested object literals and arrays, for raw transport values, while treating
  intermediate property navigation (`response.body.user`) as translation, not
  leakage. Status reads used as `if`/ternary conditions are translation logic,
  not leaked values.

### Delegation semantics

- `domain-operation-delegation` counts a submit path as delegated when the
  handler (or a module-level helper / object method it calls) awaits or
  promise-chains (`.then`/`.catch`/`.finally`) an operation from a resolved
  module that is the boundary or translates into a domain shape. Awaiting a raw
  transport adapter (for example `api/http`) is not delegation.
- When a submit handler invokes a resolved external domain operation without
  `await` or a promise chain (bare fire-and-forget), the analysis is
  `indeterminate` with a stable reason, honoring the fail-closed requirement.

### Translation binds to auth success and failure

- `boundary-response-translation` now requires the resolved boundary to own
  transport and translate both expected success (200) and failure (401) into
  domain-shaped values (returns or throws). Partial translation (success only,
  failure returning raw) fails the criterion.

### Determinism and irrelevant imports

- Component selection prefers a `LoginPage`-named module, then deterministic
  lexicographic order, so SourceMap key order cannot change the result.
- CSS/asset (non-source) imports are explicitly irrelevant: named/default CSS
  imports and side-effect CSS imports are both ignored rather than unresolved or
  silently skipped. Only unresolved or ambiguous *source* imports fail closed.

### Calibration gates

- The matrix expands to cover the review blind spots: two-layer boundary,
  `document.body` access, uncalled transport util, nested raw leak, partial
  translation, `.then()` chain, bare call, file ordering, CSS imports, and
  component-direct-transport. Anti-pattern separation asserts criterion
  directions (specific criteria must be zero), not only totals.
- Add a re-evaluation gate: run v2 over the six existing v5/v6 pilot outputs and
  report criterion-level results before v2 is selected for a new pilot. If all
  conditions score identically, the task (starter) lacks headroom and a separate
  issue/change must adjust the task before another pilot.

### Out of scope (follow-up issues)

- Runner judge-provider integration, the SourceMap construction contract,
  indeterminate-rate budget, and the pilot denominator protocol are follow-up
  work tracked separately; this change does not wire v2 into the runner.
- Changing the task starter to create headroom is a separate change if the
  re-evaluation confirms a ceiling.
