## 1. OpenSpec and planning gate

- [x] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #135. (`openspec validate login-page-realistic-practice-candidate --type change --strict` passed; PR #141)
- [x] 1.2 Confirm with the requirements owner: API contract as public starter contract vs starter-source-only; which UI/UX dimensions are deterministic semantic vs JudgeAgent soft scoring; Practice card reuse vs new card. Record answers in this change's design. (Confirmed: independent API contract file; minimal semantic + quality soft scoring; reuse react.api.layered-design; realistic SaaS context; no issue comment.)

## 2. Candidate scaffold

- [x] 2.1 Create the new candidate directory under `incubator/practice-injection/<slug>-v1/` with public task card (natural statement, no fixture paths), starter with real API contract and `bun run test` entry, and private candidate/conditions/oracle manifests. (Created `incubator/practice-injection/login-page-auth-flow-v1/`; `public/task.md` 工单风格；starter 含 `docs/auth-api.md`、`src/api/http.ts`、`src/LoginPage.tsx`、`tests/login.spec.ts`；private/candidate.yaml + conditions.yaml + oracle.yaml；`bun run test` 2/2 红（真占位 baseline：表单未接通）。) [Write scope: `incubator/practice-injection/<slug>-v1/`]
- [x] 2.2 Write the private evaluator verifying only task-declared observable behavior (semantic hard gate) and a separate soft-signal probe for layering/UI/UX/form quality; keep Oracle/Practice/evaluator private. (evaluate.ts 语义硬门槛 = `bun run test`；verify-layering.ts 分层质量信号输出 practice_observation，结构检测不依赖固定命名；全部位于 private/。) [Write scope: `incubator/practice-injection/<slug>-v1/private/`]

## 2a. Independent AI authenticity review gate

- [x] 2.3 Provide an external-AI authenticity review guide (prompt + checklist) for `public/task.md` and `public/starter/app/`, documented in this change and the PR, so the requirements owner can hand the review to an independent AI before calibration; fix-list items are addressed before calibration. (指南：`authenticity-review-guide.md`，含提示词与 pass/fix 清单；用途与门禁写入 design.md Planning Confirmation 与本 PR 正文。)
  （round 1 审查已执行：8 项穿帮点全部修复，记录见 guide 的「审查记录（round 1）」。）
  （D2 决议：题面分层提示为需求方有意保留；verify-layering.ts 升级为名称无关结构检查以适配该规范，详见 design.md。）

## 3. Calibration and snapshot

- [x] 3.1 Build private calibration fixtures (reference, equivalent, anti-pattern) and run candidate calibration proving semantic + quality discrimination; keep calibration private. (kernel calibrate 通过：4 fixtures semantic=pass；reference/equivalent practice_observation=observed；public-starter/anti-pattern=not-observed。) [Write scope: `incubator/practice-injection/<slug>-v1/private/calibration/`]
- [x] 3.2 Generate and verify the candidate's private snapshot; confirm `login-page-layered-api-v1` and its snapshot/records are unchanged. (snapshot.ts --incubator --write practice-injection login-page-auth-flow-v1 生成并通过只读校验；`git status` 确认未改动 login-page-layered-api-v1。) [Write scope: `incubator/practice-injection/<slug>-v1/private/`]

## 4. Verification and evidence

- [x] 4.1 Run candidate calibration, public/private leak audit, snapshot validation, `bun run validate`, and evaluator tests; record command outcomes and omissions in the PR. (kernel calibrate 矩阵全绿；kernel isolate leaked=[]；snapshot 校验 intact；`bun run validate` 通过；evaluate.ts 对 starter 输出 semantic=fail / not-observed（与最终矩阵一致）；命令输出与省略项记录在 PR 正文。) [Execution scope: repo-wide]
- [x] 4.2 Confirm no default-suite entry, no formal record, no model call, and no modification to `login-page-layered-api-v1` or historical results; check off completed tasks immediately. (未新增默认 suite 条目、未创建正式 record、未调用模型；未触碰 login-page-layered-api-v1 与历史结果。)
