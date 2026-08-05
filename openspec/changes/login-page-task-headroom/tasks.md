## 1. OpenSpec and planning gate

- [ ] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #145. (`openspec validate login-page-task-headroom --type change --strict` passed)
- [ ] 1.2 Confirm with the requirements owner: gap strategy (default: keep `api/http.ts`, remove the `api/session.ts` translation layer), Practice convention injection form (`docs/frontend-guide.md` section, condition-scoped), whether existing capabilities stay, and scope (login page only). Record answers in this change's design.

## 2. Candidate revision scaffold [write scope: `incubator/practice-injection/login-page-auth-flow-v2/`]

- [ ] 2.1 Create the new candidate directory with public task card (work-order tone, no layering hints), starter with git history and engineering context (keep `api/http.ts`, remove/degrade `api/session.ts` translation layer), and private candidate/conditions/oracle manifests.
- [ ] 2.2 Reuse `verify-layering.ts` + v2 judge (#144) for the layering quality signal and adapt if the new starter shape requires it; keep evaluator/oracle/practice private.

## 3. Realism and hidden injection [write scope: `incubator/practice-injection/login-page-auth-flow-v2/` + treatment]

- [ ] 3.1 Deliver the Practice as a project-internal convention (`docs/frontend-guide.md` 「前端分层约定」) injected only for the oracle-practice condition; public traces record only version and hash.
- [ ] 3.2 Environment test-trace audit: workspace/prompt free of scoring/hash/condition/evaluation wording; local dry-run checks the workspace content from the agent's perspective.

## 4. Calibration, snapshot, and verification

- [ ] 4.1 Use v2 to offline re-score revised baseline/oracle constructed samples; produce a criterion-level table showing the baseline gap and oracle closure; calibration matrix passes.
- [ ] 4.2 Generate and verify the candidate snapshot; run public/private leak audit, `bun run validate`, OpenSpec strict validation, and `git diff --check`.
- [ ] 4.3 Confirm `login-page-auth-flow-v1` and historical results are untouched, no default-suite entry, no formal record, and no model call.
