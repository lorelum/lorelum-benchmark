## Context

#91 建立的两个 Practice-injection candidate（`profile-update-command-boundary-v1`、`project-directory-resource-state-v1`）用于扩大样本，但沿用早期设计：starter 已把任务全部做完（无 Practice 可观测缺口，baseline 无注入即全过）、公开测试依赖产品内 `window.__` 埋点、task 为验收腔、Practice 以 practice-card 注入。登录页 pilot（#137/#143/#145/#149）已把「真实题面 + 占位 starter + 项目内规范条件注入 + 公平可解释评分」沉淀为主线与模板（`login-page-auth-flow-v2`）。本 change 将同样的 v2 模式落地到这两个 candidate。

## Goals / Non-Goals

**Goals:**

- 新建 `incubator/practice-injection/profile-update-command-boundary-v2/` 与 `incubator/practice-injection/project-directory-resource-state-v2/`（不改写 v1 与 #91/#125 历史身份）。
- 每个 v2 candidate：真实工单口吻 task（声明可观察行为 + 自然语言基本分层要求）、占位 starter（保留传输 adapter，移除预置领域翻译/查询边界，无 `window.__` 埋点）、公开测试经 `page.route` 拦截 API、Practice 以项目内规范条件化注入、职责可解释探针与校准/离线缺口验证。
- 生成并校验 snapshot，通过 public/private 泄露审计、`bun run validate`、OpenSpec strict。

**Non-Goals:**

- 不修改两个 v1 candidate、#91/#125 执行计划与 scratch 结果；不执行模型调用、不创建正式 record、不升级 suite revision。
- 不改写 `injection-calibration/v1` / `practice-card/v1`（保持冻结），仅复用已合并的 `injection-calibration/v2` + `project-convention/v1`。
- 不新增 Practice 卡内容（沿用 `react.command-domain-boundary` / `react.query-resource-state` 语义，改写为项目内规范措辞）。
- 不覆盖 runner、judge provider、检索或正式执行。

## Decisions

### 新 revision 而非原地修改

v1 已有 #91 scratch 诊断结果与执行计划，禁止改写。新建 v2 独立 candidate，拥有独立 manifest/snapshot/条件身份。

### 制造缺口的 starter 设计（默认方向，规划澄清确认）

按 `login-page-auth-flow-v2` 模板：

- `profile-update-command-boundary-v2`：保留 `src/services/http.ts`（传输 adapter，`fetch` 调 `/api/profile`，返回带 status 的 DTO），移除 v1 中预置的领域化封装（加载/保存的组件外命令边界）；`LoginPage` 为页面外壳：显示名输入 + 保存按钮存在，但未接加载、未接提交、无禁用/成功/冲突状态。
- `project-directory-resource-state-v2`：保留 `src/services/http.ts` 传输 adapter（`fetch` 调 `/api/projects`），移除预置查询边界与状态机；`LoginPage` 为目录外壳：搜索框 + 列表容器存在，但未接加载/搜索/空结果/失败/重试。
- task.md 只描述产品可观察行为（加载/校验/保存成功/冲突/禁用、搜索/空结果/失败/重试）与自然语言基本分层提示，不把详细约定（翻译、原始 response 隔离、显式资源状态）写进题面。
- 语义硬门槛由 Playwright 测试承担（`page.route` 拦截 API，不用产品内计数）；Practice 质量由职责探针测量。

### 无产品内埋点

- 传输 adapter 与组件均不得设置 `window.__*` 计数；公开测试通过 `page.route` stub API，并用 `waitForRequest` 计数 + 断言无额外请求来验证「只发起一次请求」，与 `login-page-auth-flow-v2` 一致。

### Practice 注入条件化 + 项目内规范呈现

- Practice 文本改写为项目内既有规范形态（`docs/frontend-guide.md` 的「命令/领域结果边界约定」或「查询资源状态约定」小节，措辞像团队约定）。
- 经 `injection-calibration/v2`（delivery template `project-convention/v1`）条件写入 workspace 的 `docs/frontend-guide.md`：oracle-practice 收到被测规范，irrelevant-practice 收到无关对照规范，baseline 不收到任何规范；规范不得进入共享 starter。
- 公开痕迹只记录规范版本与 hash；规范随最后一条 git commit 进入 oracle/irrelevant 条件的 git 历史（baseline 无该文件），由 git-history.yaml manifest + 条件注入共同复现。

### 职责可解释探针（v2）

- 以 `login-page-auth-flow-v2` 的 `verify-layering.ts` 为参照，把两个 v1 探针（`verify-command-boundary.ts` / `verify-resource-state.ts`）升级为名称无关、按职责断言的 v2：组件不得直接导入 transport adapter / 读取原始 status/body；每个提交/查询路径必须 await 组件外领域操作；边界模块负责实际 transport 并翻译领域结果/显式资源状态；边界不得返回原始 response。
- 校准矩阵要求：reference（自建领域边界）pass/observed、equivalent（不同命名/结构的职责等价实现）pass/observed、anti-pattern（组件直连 transport）pass/not-observed、public-starter（占位）fail/not-observed。

### git 历史与环境真实化

- 每个 v2 starter 提供 `private/execution/git-history.yaml`，按「脚手架 → API client + docs → 测试 → 外壳等待接通」固定 commit 序列；工作区/prompt 不出现 benchmark/评分/condition/hash 字样。

## Risks / Trade-offs

- [去掉预置实现后 baseline 可能仍被模型「自然」补上] → 离线缺口验证：构造 baseline 直接处理原始响应的样例应 not-observed，oracle 自建边界样例应 observed；不足则调整 starter。
- [职责探针误伤等价实现] → 先构造 equivalent 样例校准；无法构造等价通过样例的断言不得作为失败条件。
- [项目内规范仍可能被识破] → 措辞贴近团队约定 + 事后被动审计；结论按诊断定位。
- [两个 candidate 并行增大实现量] → 共享校准基座（`injection-calibration/v2` react-vite app-shell）与探针骨架，按 tasks 依赖顺序推进。

## Migration Plan

1. 创建本 OpenSpec-only PR（仅 artifacts），引用 #151，通过 strict validation。
2. 规划澄清：确认缺口方式、规范注入形态、分层提示强度、修订范围，写回 issue #151 与本 design 的 Planning Confirmation。
3. 实现两个 v2 candidate（public/private、starter + git-history、conditions/oracle/evaluator、practices 规范文本、calibration、snapshot），持续提交到同一 PR。
4. 每个 candidate 跑校准矩阵、离线缺口验证、public/private audit、`bun run validate`、OpenSpec strict、`git diff --check`，保留证据。
5. 不执行正式 benchmark、不创建 record；v1 与 #91 历史保持不动。

回滚：删除两个 v2 candidate 目录即可；不触碰 v1 与历史记录。

## Open Questions

- 缺口方式：默认「保留 `services/http.ts`、移除预置领域翻译/查询边界」。
- 规范注入形态：默认 `docs/frontend-guide.md`（`injection-calibration/v2` + `project-convention/v1`）。
- 分层提示强度：默认保留 `login-page-auth-flow-v2` 式自然语言基本提示。
- 修订范围：仅两个 #91 candidate。
- 探针复用：直接复用/升级现有 `verify-command-boundary.ts` / `verify-resource-state.ts`，还是抽取共享 helper。

## Planning Confirmation

待需求方确认后写入（对应 issue #151 的待确认问题）。
