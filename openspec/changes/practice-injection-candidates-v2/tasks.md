## 1. OpenSpec 与规划门禁

- [x] 1.1 对本 change 运行 strict validation 并创建仅含 OpenSpec artifacts 的初始 PR，关联 #151（PR #152）。
- [x] 1.2 与需求方确认设计决策（缺口方式、规范注入形态、分层提示强度、修订范围、打分制评分路线、task.md 审批门禁、独立 agent 验证），写回 issue #151 与 design.md Planning Confirmation。
- [x] 1.3 评分路线确认：打分制评分依赖独立 issue #153 的仓库级通用 LLM JudgeAgent（`judge-agent/generic/v1`），本 change 只声明与消费，不新建 per-candidate 静态 judge。
- [x] 1.4 草拟两个 v2 candidate 的 task.md 并提交需求方审批（2026-08-06 确认「可以继续」）；审批通过后生成 snapshot、进入校准与验证。

## 2. profile-update-command-boundary-v2 [write scope: `incubator/practice-injection/profile-update-command-boundary-v2/`]

- [ ] 2.1 经审批的 public task.md + 占位 starter（保留 `src/services/http.ts` 传输 adapter、`docs/profile-api.md`、`page.route` 测试，无 `window.__` 埋点，未预置领域翻译/查询边界）。
- [ ] 2.2 private manifests（candidate/conditions/oracle，`judge.provider: judge-agent/generic/v1`）、practices 规范文本（命令/领域结果边界 + 模态框焦点对照，`project-convention/v1`、`target_path: docs/frontend-guide.md`、±10%）、v2 职责探针 `verify-command-boundary.ts`、evaluator（evaluate + runtime-closure）、execution（tool-policy + git-history）、calibration（sets.yaml 含 quality-probe 与 judge 校准、run.ts、overlays）。
- [x] 2.3 校准矩阵 4/4 通过；通用 LLM judge（#153，显式 opt-in，每夹具 3 次取样中位数）判别力验证通过：reference 75 / equivalent 74 / anti-pattern 34（gap 41）；离线缺口验证通过（public-starter 5、oracle 高分）。

## 3. project-directory-resource-state-v2 [write scope: `incubator/practice-injection/project-directory-resource-state-v2/`]

- [ ] 3.1 经审批的 public task.md + 占位 starter（保留 `src/services/http.ts` 传输 adapter、`docs/projects-api.md`、`page.route` 测试，无 `window.__` 埋点，未预置查询边界/状态机）。
- [ ] 3.2 private manifests（candidate/conditions/oracle，`judge.provider: judge-agent/generic/v1`）、practices 规范文本（查询资源状态 + 头像回退对照，`project-convention/v1`、`target_path: docs/frontend-guide.md`、±10%）、v2 职责探针 `verify-resource-state.ts`、evaluator（evaluate + runtime-closure）、execution（tool-policy + git-history）、calibration（sets.yaml、run.ts、overlays）。
- [x] 3.3 校准矩阵 4/4 通过；通用 LLM judge 判别力验证通过：reference 100 / equivalent 96 / anti-pattern 40（gap 60）；离线缺口验证通过。

## 4. 门禁与验证

- [x] 4.1 每个 v2 candidate 生成并校验 snapshot（un run snapshot.ts --write + un run validate Snapshots intact）；public/private 泄露审计 0 泄露。
- [ ] 4.2 `bun run validate`、`bun test src/benchmark/judge src/benchmark/evaluator src/benchmark/runner/pi/v2`、OpenSpec strict validation、`git diff --check` 全绿，证据保留在 PR #152。
- [x] 4.3 由独立 agent 在真实运行环境执行验证（starter 语义测试、agent 视角真实性审计、泄露审计、结构完整性），输出独立报告并集成到 PR #152；发现并修复 package.json name 身份痕迹（中性化），其余通过。
- [x] 4.4 终检：两个 v1 candidate、#91/#125 执行计划与 scratch 结果未改动；未执行 Pi/agent 模型调用（judge 的 LLM 调用为显式 opt-in 校准）、未创建正式 record、未升级 suite revision。
