## 1. Scope and lifecycle

- [x] 1.1 Record #137 pilot evidence and freeze the v1/v2 boundary: v1 rubric, v1 scorer, v1 calibration, v1 snapshot, and v1 summaries remain unchanged.
- [x] 1.2 Run strict OpenSpec validation and create the initial PR containing only this change's artifacts before adding candidate judge/calibration files.

## 2. Practice-specific rubric and scorer

- [x] 2.1 Add versioned v2 rubric metadata with only the four API-layering criteria and explicit exclusion of functional/UI/form dimensions.
- [x] 2.2 Implement AST-backed v2 source analysis with relative and declared alias resolution, intermediate-binding tracking, and stable `indeterminate` reasons for unresolved or ambiguous graphs.
- [x] 2.3 Emit provenance-complete `judge-result/v1` sidecars bound to the v2 rubric hash, with criterion IDs and maximum points totaling 100.
- [x] 2.4 Add focused tests for direct and indirect disabled bindings, brace-form guards, renamed helpers, alternate pending state, raw-response aliases, unresolved aliases, and unrelated imported modules.

## 3. Calibration and evidence

- [x] 3.1 Add private v2 calibration fixtures for reference, at least two responsibility-equivalent implementations, a declared anti-pattern, and an ambiguous graph.
- [x] 3.2 Implement the v2 calibration command and assert criterion-level equivalence, anti-pattern separation, and fail-closed ambiguity handling.
- [x] 3.3 Update the candidate snapshot with only the new versioned v2 artifacts; do not rewrite any v1 file or historical result.

## 4. Validation and handoff

- [x] 4.1 Run v2 focused tests, input redaction checks, candidate snapshot verification, `bun run validate`, OpenSpec strict validation, and `git diff --check`.
- [x] 4.2 Document that future pilots must explicitly select v2 and that no model call, formal record, suite revision, or causal conclusion is produced by this change.

## 5. Review-driven revision (2026-08-05)

- [x] 5.1 Record the review decision in design/spec/proposal and on issue #137: data-flow evidence, delegation semantics, translation binding, deterministic component selection, irrelevant non-source imports, calibration blind spots, and the v5/v6 re-evaluation gate.
- [x] 5.2 Fix score.ts P0: importedTransport data-flow (boundary exclusion + call edge), rawReads data-flow (transport-result receivers only), and recursive raw-response containment in return expressions.
- [x] 5.3 Fix score.ts P1: promise-chain (.then/.catch/.finally) delegation with bare-call indeterminate, 200/401 translation binding, deterministic LoginPage-first component selection, and irrelevant CSS/asset imports.
- [x] 5.4 Expand the calibration matrix to cover the review blind spots (two-layer boundary, document.body, uncalled transport util, nested raw leak, partial translation, promise chain, bare call, file ordering, CSS imports, component-direct-transport) and switch anti-pattern separation to criterion-direction assertions; update sets.yaml, calibrate.ts, and calibration.md.
- [x] 5.5 Extend judge.test.ts with regression tests for each new behavior.
- [x] 5.6 Run v2 focused tests and the kernel calibration; record criterion-level evidence in the PR.
- [x] 5.7 Re-evaluate the six v5/v6 pilot outputs with v2; record a criterion-level table and a task headroom conclusion.
- [x] 5.8 Update the candidate snapshot, run bun run validate, OpenSpec strict validation, and git diff --check; keep v1 artifacts and historical results untouched.

- [x] 5.9 Second review round: accept ok-shaped adapters, harden component selection against LoginForm-named shared components, scope translation to the submit-path operation, make multi/two-boundary behavior explicit in calibration, and treat CSS query-suffix imports as irrelevant; update spec/design/calibration and re-run all gates.
