## 1. OpenSpec and required planning gate

- [x] 1.1 Ran strict OpenSpec validation, committed only the #198 OpenSpec artifacts, and created artifact-only PR #205 from `codex/judge-agent-cross-scenario-v2-contract` referencing issue #198. No candidate fixtures, tasks, runner code, model calls, records, or generated run artifacts were added.
- [ ] 1.2 After the artifact-only PR exists and strict validation passes, request and enter Plan mode. Confirm all six questions in `design.md` "Open Questions — Plan-mode Gate" with the requester before implementation planning proceeds.
- [ ] 1.3 Write the Plan-mode answers back to issue #198 and revise `design.md`/`tasks.md` with the confirmed descriptor fields, approval/provenance choice, scenario families, calibration admission rule, model/prompt/budget/blind-review boundary, and migration boundary.

## 2. Documentation-only design deliverables (blocked by 1.2–1.3)

- [ ] 2.1 Produce a capability map for `generic/v2`, `src/benchmark/judge/input.ts`, and #132/#133/#146/#153: identify what is reusable, missing, and prohibited from reuse for cross-scenario scoring.
- [ ] 2.2 Define two non-isomorphic descriptor and calibration-package outlines—one UI/service-boundary scenario and one cross-request gateway/policy scenario—without creating candidate fixtures or putting private labels/thresholds in public material.
- [ ] 2.3 Perform and document a public/private exclusion review for descriptor fields, rubric proposal/approval provenance, calibration-package inputs, public logs, and model input.
- [ ] 2.4 Define the implementation-readiness decision: conditions for a separate implementation issue/OpenSpec, conditions for retaining a scenario family as experimental, and conditions that keep fixed task-specific rubrics in place.

## 3. Validation and closeout

- [ ] 3.1 Re-run strict OpenSpec validation and `git diff --check` after the planning answers and documentation-only deliverables are complete.
- [ ] 3.2 Confirm no runtime code, schema, suite/task revision, candidate fixture, provider invocation, benchmark execution, formal record, or private material was added by this design change.
- [ ] 3.3 Record the design-stage evidence and remaining implementation gate on issue #198 and the single PR. Do not close or merge the PR while the OpenSpec change remains unarchived.
