# v2 re-evaluation of the #137 pilot outputs (gate P2-8)

Date: 2026-08-05. Run locally with `bun` (no model call). SourceMap for each
attempt is reconstructed from `scratch/login-page-auth-flow-pilot-v5|-v6/<condition>/<attempt>/workspace/app`,
excluding `node_modules`, `test-results`, `playwright-report`, `dist`, `.git`,
`.vite`; analyzed with `analyzePractice` + `scoreSourceV2` (deterministic scorer).

v2 rubric hash: `3d4d719b89dcd83f46cb7953d51e1b1f3f53b76bf351ada3902aae04fb3dba09`

## Criterion-level results

| Pilot / condition / attempt | state | score | component-transport-isolation | domain-operation-delegation | boundary-response-translation | raw-response-containment |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| v5 / baseline / attempt-1 | observed | 100 | 30 | 25 | 30 | 15 |
| v5 / oracle-practice / attempt-1 | observed | 100 | 30 | 25 | 30 | 15 |
| v5 / oracle-practice / attempt-1-r1 (retry) | observed | 100 | 30 | 25 | 30 | 15 |
| v5 / irrelevant-practice / attempt-1 | observed | 100 | 30 | 25 | 30 | 15 |
| v6 / baseline / attempt-1 | observed | 100 | 30 | 25 | 30 | 15 |
| v6 / oracle-practice / attempt-1 | observed | 100 | 30 | 25 | 30 | 15 |
| v6 / oracle-practice / attempt-1-r1 (retry) | observed | 100 | 30 | 25 | 30 | 15 |
| v6 / irrelevant-practice / attempt-1 | observed | 100 | 30 | 25 | 30 | 15 |

The six primary runs (one per condition per pilot) all score 100/100 with every
criterion observed; the two oracle retry attempts score identically.

## Conclusions

1. **v2 removes the v1 literal-misjudgment bias.** v1 deducted points from
   equivalent syntax (intermediate `disabled` bindings, brace-form guards);
   every v5/v6 output now receives the full 100 with no spurious deductions.
2. **The task has no observable headroom for this Practice (ceiling effect).**
   The baseline (no injection) already fully satisfies the four layered-API
   responsibilities because the starter pre-loads `api/http.ts` (transport +
   DTO) and `api/session.ts` (200/401 -> LoginResult). v2 cannot separate the
   three conditions: all conditions score identically. The review's prediction
   is confirmed; a task change (for example, not pre-loading the boundary or
   requiring a new un-preset interface) is needed to create headroom, and that
   is a separate issue/change, not a judge fix.
3. **The gate caught a judge bug.** v6 baseline/oracle initially returned
   `indeterminate` ("multiple candidate boundaries") because a page that imports
   a value and a type from the same module produced duplicate candidate
   boundaries. `boundaryFor` now de-duplicates candidates by module, and a
   regression test covers value+type imports from one module.

This evidence is part of the v2 change but does not create a formal record or
conclude any Practice effect.
