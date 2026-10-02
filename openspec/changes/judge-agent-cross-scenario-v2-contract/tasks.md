## 1. OpenSpec and planning gate

- [x] 1.1 Ran strict OpenSpec validation, committed only the #198 OpenSpec artifacts, and created artifact-only PR #205 from `codex/judge-agent-cross-scenario-v2-contract`.
- [x] 1.2 Entered Plan mode after PR #205 existed and confirmed scope, research-driven workflow, optional evaluator-code drafts, privacy/blinding, study-specific validation, #200 independence, and walkthrough policy with the requester.
- [x] 1.3 Updated issue #198 and the OpenSpec artifacts with the confirmed plan. #198 remains design-only.

## 2. Research-adaptive evaluation design

- [x] 2.1 Map current `generic/v2`, input allowlist, and #132/#133/#146/#153: reusable public-only input/provenance/mock/soft-score foundations; missing research-question method selection and evidence-gap handling; do not reuse task-specific code heuristics as universal criteria.
- [x] 2.2 Add two non-normative research-method walkthroughs: #200’s blinded task-specific LLM soft score and #192’s deterministic comparison with no LLM Judge. Use them only to verify different method choices, not as scope proof or universal rubric/calibration requirements.
- [x] 2.3 Define the boundary: approved public research context for planning; allowlisted, blinded evidence for scoring where needed; no private Oracle/evaluator/scoring/Practice payload or condition mapping to model; no runner/task/environment/instrumentation edits by code drafts.
- [x] 2.4 Define method-specific validation and implementation readiness: human approval before tool drafts; human review before isolated public/synthetic smoke; a new implementation issue/OpenSpec/PR; no migration of `generic/v1`, `generic/v2`, #200, or historical results without explicit validation.

## 3. Validation and closeout

- [x] 3.1 Ran `openspec validate judge-agent-cross-scenario-v2-contract --type change --strict --json` (valid, 0 issues) and `git diff --check` after the design and issue updates.
- [x] 3.2 Audited the final change: only the #198 OpenSpec proposal/design/spec/tasks are modified; no provider/evaluator/runner/schema/task/fixture/environment code, private material, model calls, benchmark runs, or formal records were added.
- [x] 3.3 Recorded design/validation evidence on issue #198 and PR #205; kept PR #205 open. Archive/sync OpenSpec and complete the required independent reviews before any future merge or closure.
