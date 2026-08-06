## 1. OpenSpec 与规划门禁

- [ ] 1.1 对本 change 运行 strict validation 并创建仅含 OpenSpec artifacts 的初始 PR，关联 #151。
- [ ] 1.2 与需求方确认设计决策（缺口方式、规范注入形态、分层提示强度、修订范围），写回 issue #151 与 design.md Planning Confirmation。

## 2. profile-update-command-boundary-v2 [write scope: `incubator/practice-injection/profile-update-command-boundary-v2/`]

- [ ] 2.1 创建 v2 candidate：public task.md（真实工单口吻，声明加载/校验/保存成功/冲突/禁用等可观察行为与基本分层要求）+ 占位 starter（保留 `src/services/http.ts` 传输 adapter 与 API 文档，移除预置领域翻译/查询边界，无 `window.__` 埋点，公开测试经 `page.route` 拦截）。
- [ ] 2.2 编写 private manifests（candidate/conditions/oracle）、git-history.yaml、practices 规范文本（`docs/frontend-guide.md` 命令/领域结果边界约定 + 无关对照）、v2 职责探针（名称无关的 required/forbidden responsibilities）。
- [ ] 2.3 校准矩阵（reference/equivalent 通过、anti-pattern 拒绝、public-starter 缺口）与离线缺口验证（baseline 缺口、oracle 可补上）。

## 3. project-directory-resource-state-v2 [write scope: `incubator/practice-injection/project-directory-resource-state-v2/`]

- [ ] 3.1 创建 v2 candidate：public task.md（真实工单口吻，声明加载/搜索/空结果/失败/重试恢复等可观察行为与基本分层要求）+ 占位 starter（保留 `src/services/http.ts` 传输 adapter 与 API 文档，移除预置查询边界与状态机，无 `window.__` 埋点，公开测试经 `page.route` 拦截）。
- [ ] 3.2 编写 private manifests（candidate/conditions/oracle）、git-history.yaml、practices 规范文本（`docs/frontend-guide.md` 查询资源状态约定 + 无关对照）、v2 职责探针（名称无关的 required/forbidden responsibilities）。
- [ ] 3.3 校准矩阵（reference/equivalent 通过、anti-pattern 拒绝、public-starter 缺口）与离线缺口验证（baseline 缺口、oracle 可补上）。

## 4. 门禁与验证

- [ ] 4.1 每个 v2 candidate 生成并校验 snapshot；public/private 泄露审计确认无私有材料进入 public/agent workspace。
- [ ] 4.2 `bun run validate`、OpenSpec strict validation、`git diff --check` 全绿，验证证据保留在 PR。
- [ ] 4.3 确认两个 v1 candidate、#91/#125 执行计划与 scratch 结果未改动；不执行模型调用、不创建正式 record、不升级 suite revision。
