## 1. Scope and lifecycle

- [ ] 1.1 Record #137 pilot evidence and freeze the v1/v2 boundary: v1 rubric, v1 scorer, v1 calibration, v1 snapshot, and v1 summaries remain unchanged.
- [ ] 1.2 Run strict OpenSpec validation and create the initial PR containing only this change's artifacts before adding candidate judge/calibration files.

## 2. Practice-specific rubric and scorer

- [ ] 2.1 Add versioned v2 rubric metadata with only the four API-layering criteria and explicit exclusion of functional/UI/form dimensions.
- [ ] 2.2 Implement AST-backed v2 source analysis with relative and declared alias resolution, intermediate-binding tracking, and stable `indeterminate` reasons for unresolved or ambiguous graphs.
- [ ] 2.3 Emit provenance-complete `judge-result/v1` sidecars bound to the v2 rubric hash, with criterion IDs and maximum points totaling 100.
- [ ] 2.4 Add focused tests for direct and indirect disabled bindings, brace-form guards, renamed helpers, alternate pending state, raw-response aliases, unresolved aliases, and unrelated imported modules.

## 3. Calibration and evidence

- [ ] 3.1 Add private v2 calibration fixtures for reference, at least two responsibility-equivalent implementations, a declared anti-pattern, and an ambiguous graph.
- [ ] 3.2 Implement the v2 calibration command and assert criterion-level equivalence, anti-pattern separation, and fail-closed ambiguity handling.
- [ ] 3.3 Update the candidate snapshot with only the new versioned v2 artifacts; do not rewrite any v1 file or historical result.

## 4. Validation and handoff

- [ ] 4.1 Run v2 focused tests, input redaction checks, candidate snapshot verification, `bun run validate`, OpenSpec strict validation, and `git diff --check`.
- [ ] 4.2 Document that future pilots must explicitly select v2 and that no model call, formal record, suite revision, or causal conclusion is produced by this change.
