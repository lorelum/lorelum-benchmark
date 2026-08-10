## Why

现有 practice-injection candidate（`login-page-auth-flow-v2`、`profile-update-command-boundary-v2`、`project-directory-resource-state-v2`）全部是 React 前端单请求任务：被测 Practice 集中在「前端分层职责边界」，语义硬门槛只有表单/列表交互状态，评分维度无法覆盖「跨模块架构收益」类 Practice——例如设计统一供应商接口、边界记账/观测、配置驱动多实现选择。issue #161 提出新增一个更复杂的多供应商 LLM 网关候选，验证这类 Practice 相对 baseline 与无关对照是否显著领先。

## What Changes

- 新建 `incubator/practice-injection/llm-provider-gateway-v1/`：纯后端 TypeScript/Bun REST candidate（不改写任何现有 candidate、suite、treatments 或历史结果）。
- 公开面：真实工单口吻 `public/task.md`（接入协议不同的 Anthropic、OpenAI 兼容类供应商只改配置即可切换、支持 SSE 流式、提供用量/费用可观测）+ 占位 starter（仅硬编码 OpenAI 直连路径，无抽象、无记账、无 `/api/usage`，Anthropic/DeepSeek 未接入）+ 公开 API 文档与公开语义测试（本地 stub HTTP 服务器模拟各供应商协议，含 SSE，确定性、无真实网络、无浏览器 UI）。
- 私有面：practices（oracle 卡 `llm.provider-gateway` 单卡三建议 + irrelevant 卡 `backend.pagination` 分页约定，`project-convention/v1` 条件化注入 `docs/ai-gateway-guide.md`）、`conditions.yaml`（baseline/oracle-practice/irrelevant-practice + `decision_rule: joint-pass-count`）、`oracle.yaml`、职责探针 `verify-provider-gateway.ts`、evaluator（evaluate + runtime-closure）、execution（tool-policy + git-history）、calibration（sets.yaml + run.ts + reference/equivalent/anti-pattern/文档在场负例 overlays）、snapshot。
- 评分：语义硬门槛（7 条，含 DeepSeek 仅改配置可切、Anthropic 同代码切换、usage 字段映射与费用精确断言）→ `evaluator-result/v2`；静态职责探针产出 `practice_observation`；`judge-agent/generic/v1` 软评分 sidecar（8 维 rubric），逐条件报告，不合并总分。
- 校准基座：新增 `incubator/calibration-bases/injection-calibration/v2/node-ts/app-shell/v1/`（参照 react-vite base 模式）。
- 门禁：task.md 先提交需求方审批；独立 AI 真实性审查；校准矩阵 5 类固定样例；public/private 泄露审计；`bun run validate`、OpenSpec strict、`git diff --check` 全绿。
- 明确不做：不调用模型、不创建正式 record、不升级 suite revision；v1 不含 function calling/tool use、多租户配额、自动重试、多币种汇率；更多异形供应商留作 v2 扩展。

## Capabilities

### New Capabilities

- `llm-provider-gateway-practice-candidate`：定义多供应商 LLM 网关 Practice candidate 的 v1 要求——纯后端 REST + SSE 流式 + 固定 USD 计费 + 结构化日志与聚合 API；开放供应商注册表（OpenAI 兼容类=纯配置、协议不同类=一个适配器）；单卡三建议 Practice 与分页无关对照；语义硬门槛（DeepSeek 只改配置可切、Anthropic 同代码切换、usage 字段映射正确、费用精确断言、错误领域化、保护约束）；职责探针与模型运行前校准；不调用模型、不建正式 record、不升级 suite。

### Modified Capabilities

- 无。现有 stable spec（`practice-injection-candidate-v2`、`practice-benchmark-boundaries`、`judge-agent-rubric-scoring`、`practice-observation-diagnostics`）已覆盖注入形态、评分公平性、软信号分离与校准边界；本 change 只落地一个后端形态 candidate，实现按这些规范对齐。

## Impact

- Candidate：`incubator/practice-injection/llm-provider-gateway-v1/`（public/private、starter + git-history manifest、conditions/oracle/evaluator、calibration、snapshot）。
- 校准基座：`incubator/calibration-bases/injection-calibration/v2/node-ts/app-shell/v1/`。
- 依赖：#153 的 `judge-agent/generic/v1`（只声明与消费，不新建 per-candidate judge）；#147 的 `project-convention/v1` 交付模板。
- 不改写：任何现有 candidate、suite、treatments、执行计划与 scratch/record 结果。
- 不进入默认 suite，不创建正式 record。