## 1. OpenSpec and planning gate

- [ ] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #135. (`openspec validate login-page-realistic-practice-candidate --type change --strict`)
- [ ] 1.2 Confirm with the requirements owner: API contract as public starter contract vs starter-source-only; which UI/UX dimensions are deterministic semantic vs JudgeAgent soft scoring; Practice card reuse vs new card. Record answers in this change's design.

## 2. Candidate scaffold

- [ ] 2.1 Create the new candidate directory under `incubator/practice-injection/<slug>-v1/` with public task card (natural statement, no fixture paths), starter with real API contract and `bun run test` entry, and private candidate/conditions/oracle manifests. [Write scope: `incubator/practice-injection/<slug>-v1/`]
- [ ] 2.2 Write the private evaluator verifying only task-declared observable behavior (semantic hard gate) and a separate soft-signal probe for layering/UI/UX/form quality; keep Oracle/Practice/evaluator private. [Write scope: `incubator/practice-injection/<slug>-v1/private/`]

## 3. Calibration and snapshot

- [ ] 3.1 Build private calibration fixtures (reference, equivalent, anti-pattern) and run candidate calibration proving semantic + quality discrimination; keep calibration private. [Write scope: `incubator/practice-injection/<slug>-v1/private/calibration/`]
- [ ] 3.2 Generate and verify the candidate's private snapshot; confirm `login-page-layered-api-v1` and its snapshot/records are unchanged. [Write scope: `incubator/practice-injection/<slug>-v1/private/`]

## 4. Verification and evidence

- [ ] 4.1 Run candidate calibration, public/private leak audit, snapshot validation, `bun run validate`, and evaluator tests; record command outcomes and omissions in the PR. [Execution scope: repo-wide]
- [ ] 4.2 Confirm no default-suite entry, no formal record, no model call, and no modification to `login-page-layered-api-v1` or historical results; check off completed tasks immediately.