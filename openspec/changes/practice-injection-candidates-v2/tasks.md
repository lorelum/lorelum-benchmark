## 1. OpenSpec 与规划门禁

- [x] 1.1 对本 change 运行 strict validation 并创建仅含 OpenSpec artifacts 的初始 PR，关联 #151（PR #152）。
- [x] 1.2 与需求方确认设计决策（缺口方式、规范注入形态、分层提示强度、修订范围、打分制 judge、task.md 审批门禁、独立 agent 验证），写回 issue #151 与 design.md Planning Confirmation。
- [ ] 1.3 草拟两个 v2 candidate 的 task.md 并提交需求方审批；审批通过后才生成 snapshot、进入校准与验证。

## 2. 打分制 judge 基础设施 [write scope: `src/benchmark/judge/`]

- [ ] 2.1 建立 `src/benchmark/judge/practice-command-boundary/v2/`：rubric-v2.yaml（30/25/30/15 维度 + 阈值）、rubric.ts、score.ts（确定性静态分析）、calibrate.ts、judge.test.ts，并在 `src/benchmark/judge/providers.ts` 注册 provider。
- [ ] 2.2 建立 `src/benchmark/judge/practice-query-resource-state/v2/`：同上结构（查询资源状态语义），并注册 provider。
- [ ] 2.3 judge 单元测试通过：`bun test src/benchmark/judge/practice-command-boundary/v2 src/benchmark/judge/practice-query-resource-state/v2`。

## 3. profile-update-command-boundary-v2 [write scope: `incubator/practice-injection/profile-update-command-boundary-v2/`]

- [ ] 3.1 经审批的 public task.md + 占位 starter（保留 `src/services/http.ts` 传输 adapter、`docs/profile-api.md`、`page.route` 测试，无 `window.__` 埋点，未预置领域翻译/查询边界）。
- [ ] 3.2 private manifests（candidate/conditions/oracle，judge provider `practice-command-boundary/v2`）、practices 规范文本（命令/领域结果边界 + 模态框焦点对照，`project-convention/v1`、`target_path: docs/frontend-guide.md`、±10%）、v2 职责探针 `verify-command-boundary.ts`、evaluator（evaluate + runtime-closure）、execution（tool-policy + git-history）、calibration（sets.yaml 含 quality-probe 与 command-boundary-judge、run.ts、overlays）。
- [ ] 3.3 校准矩阵（reference/equivalent 通过、anti-pattern 拒绝、public-starter 缺口）+ judge 校准（reference ≥90、equivalent 同分、anti-pattern ≤45 且差距 ≥45）+ 离线缺口验证（baseline 0/100、oracle 100/100）。

## 4. project-directory-resource-state-v2 [write scope: `incubator/practice-injection/project-directory-resource-state-v2/`]

- [ ] 4.1 经审批的 public task.md + 占位 starter（保留 `src/services/http.ts` 传输 adapter、`docs/projects-api.md`、`page.route` 测试，无 `window.__` 埋点，未预置查询边界/状态机）。
- [ ] 4.2 private manifests（candidate/conditions/oracle，judge provider `practice-query-resource-state/v2`）、practices 规范文本（查询资源状态 + 头像回退对照，`project-convention/v1`、`target_path: docs/frontend-guide.md`、±10%）、v2 职责探针 `verify-resource-state.ts`、evaluator（evaluate + runtime-closure）、execution（tool-policy + git-history）、calibration（sets.yaml 含 quality-probe 与 query-resource-state-judge、run.ts、overlays）。
- [ ] 4.3 校准矩阵 + judge 校准 + 离线缺口验证（同 3.3）。

## 5. 门禁与验证

- [ ] 5.1 每个 v2 candidate 生成并校验 snapshot；public/private 泄露审计确认无私有材料进入 public/agent workspace。
- [ ] 5.2 `bun run validate`、`bun test src/benchmark/judge src/benchmark/evaluator src/benchmark/runner/pi/v2`、OpenSpec strict validation、`git diff --check` 全绿，证据保留在 PR #152。
- [ ] 5.3 由独立 agent 在真实运行环境执行验证（starter 语义测试、kernel 校准、agent 视角真实性审计），输出独立报告并集成到 PR #152。
- [ ] 5.4 终检：两个 v1 candidate、#91/#125 执行计划与 scratch 结果未改动；不执行模型调用、不创建正式 record、不升级 suite revision。
