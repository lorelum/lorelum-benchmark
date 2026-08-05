## 1. OpenSpec and planning gate

- [x] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #145. (`openspec validate login-page-task-headroom --type change --strict` passed; PR #147)
- [x] 1.2 Confirm with the requirements owner: gap strategy (keep `api/http.ts`, remove the `api/session.ts` translation layer), Practice convention injection form (`docs/frontend-guide.md` via `injection-calibration/v2`), scope (login page only), and starter realism (git history). Recorded in design.md Planning Confirmation and #145.

## 2. Candidate revision scaffold [write scope: `incubator/practice-injection/login-page-auth-flow-v2/`]

- [x] 2.1 Create the new candidate directory with public task card (work-order tone, no layering hints), starter with git history and engineering context (keep `api/http.ts`, remove/degrade `api/session.ts` translation layer), and private candidate/conditions/oracle manifests.
- [x] 2.2 Reuse `verify-layering.ts` + v2 judge (#144) for the layering quality signal and adapt if the new starter shape requires it; keep evaluator/oracle/practice private.

## 3. Realism and hidden injection [write scope: `incubator/practice-injection/login-page-auth-flow-v2/` + treatment]

- [x] 3.1 Deliver the Practice as a project-internal convention (`docs/frontend-guide.md` 「前端分层约定」) injected only for the oracle-practice condition; public traces record only version and hash.
- [x] 3.2 Environment test-trace audit: workspace/prompt free of scoring/hash/condition/evaluation wording; local dry-run checks the workspace content from the agent's perspective.

## 4. Calibration, snapshot, and verification

- [x] 4.1 Use v2 to offline re-score revised baseline/oracle constructed samples; produce a criterion-level table showing the baseline gap and oracle closure; calibration matrix passes.
- [x] 4.2 Generate and verify the candidate snapshot; run public/private leak audit, `bun run validate`, OpenSpec strict validation, and `git diff --check`.
- [x] 4.3 Confirm `login-page-auth-flow-v1` and historical results are untouched, no default-suite entry, no formal record, and no model call.

## 5. Injection runtime v2 [write scope: `src/benchmark/kernel/profiles/injection-calibration/v2/` + runner/snapshot]

- [x] 5.1 Add `injection-calibration/v2` profile (types + runtime) supporting delivery template `project-convention/v1`: metadata declares `target_path` (e.g., `docs/frontend-guide.md`), hash and oracle/irrelevant length calibration preserved; `v1` unchanged.
- [x] 5.2 Wire the runner (`profile-diagnostic-runner.ts`) to dispatch by profile version: accept `injection-calibration/v2`, resolve payload/trace via v2, write the convention text into the workspace `app/docs/frontend-guide.md` before Pi for oracle/irrelevant, and keep `--append-system-prompt` only for practice-card delivery.
- [x] 5.3 Update `snapshot.ts` profile handling for v2 and add contract tests for v2 parsing/validation/materialization; keep v1 tests green.
