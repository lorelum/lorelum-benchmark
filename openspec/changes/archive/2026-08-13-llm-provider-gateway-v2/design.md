## Context

#166 承接 #161 的下一 revision。#163/#164 证明 v1 的区分度主要落在静态探针与 judge：flash 档三条件语义全 3/3，baseline/irrelevant 各有 1/3 自然 observed，oracle 在 v4-pro 档仅 1/3 joint-pass，n=3 的 delta CI 为 `[0,1]`。需求方确认方向 A：v2 保留 v1 的纯后端形态与供应商适配底座，把判别力下沉到跨请求执行政策的**可观察行为正确性**，并加入伪兼容陷阱供应商。

## Goals / Non-Goals

**Goals:**

- 新建 `incubator/practice-injection/llm-provider-gateway-v2/`，独立 source/snapshot/profile 身份。
- 公开行为包含 fallback、retry 单次计费、跨供应商租户预算、幂等、流式失败记账、并发原子性与伪兼容供应商映射。
- 语义硬门槛由公开测试 + 本地确定性 stub 承担；职责探针升级为 import graph + AST 分类；judge rubric 冻结复用。
- 校准矩阵覆盖新增 anti-pattern，证明 baseline/anti-pattern 存在行为级缺口。

**Non-Goals:**

- 不修改 v1、现有 candidate/suite/treatment/共享 evaluator helper/历史结果。
- 不调用模型、不创建正式 record、不升级 suite revision。
- 不引入私有隐藏测试，不修改 runner/evaluator。
- 不做异步批处理任务、第三个真异形协议、多币种、function calling。

## Decisions

### 生命周期与身份

- v2 为新 candidate revision，位于 `incubator/practice-injection/llm-provider-gateway-v2/`，`lifecycle_stage: candidate`；v1 冻结不动。
- 本 change 只交付 candidate + 校准基座复用；本地三条件 pilot 与 suite 升级另立 issue。

### 公开契约与供应商

- 保留 v1 的 REST/SSE、固定 USD、注册表与 JSONL 底座；新增四种协议形态：OpenAI 兼容（OpenAI/DeepSeek 共用）、Anthropic 异形、Nebula 伪兼容陷阱。
- Nebula 路径为 `/v1/chat/completions`，鉴权为 `X-Nebula-Key`，响应 `output_text` + `input_tokens/output_tokens`，SSE 为 `delta.text`；它制造“路径相同但字段不同”的映射陷阱。
- 所有语义测试全公开；测试与 stub 位于 starter，evaluator 只运行 `bun run test` + 私有探针，不改 runner。

### 执行政策语义

- **fallback**：429/5xx/超时触发；重试耗尽后降级；响应/日志/费用归属实际供应商。
- **retry**：bounded、配置驱动、只重试可重试错误；一个逻辑请求一条账本。
- **租户预算**：`x-tenant-id` + 每租户 USD 预算；请求携带 `max_tokens`，按注册表最高输出单价预占，完成后实际结算；原子检查/预占/结算；余额不足 402。
- **幂等**：`Idempotency-Key` 相同且请求体相同返回缓存、不重复计费；同 key 不同体 409；缓存按租户隔离。
- **流式失败**：首 chunk 前失败 JSON；中途失败终止 SSE 错误事件；只记上游已报告 usage。
- 这些政策不写在 task.md 的实现建议里，只写可观察行为；具体组织方式留给 Practice 卡。

### 计费与观测

- 价格：openai 2.5/10、deepseek 0.27/1.1、anthropic 3/15、nebula 1/4（USD/1M tokens）。
- rounding 6 位四舍五入；JSONL 每逻辑请求一条，字段 `tenant/provider/model/trace_id/retry_count/status/cost/latency_ms`；`/api/usage` 支持 tenant/model/status 过滤与按模型/租户聚合。

### Practice 与条件

- oracle 卡 `llm.provider-gateway.v2`：适配器只做 wire 翻译；执行政策与账本集中在边界；注册表驱动；一个逻辑请求一条账本。
- 无关对照沿用 `backend.pagination`，与 oracle 卡等长 ±10%；注入 `project-convention/v1`，target `docs/ai-gateway-guide.md`。
- `conditions.yaml`：baseline / oracle-practice / irrelevant-practice；`repetitions: 5`、`max_duration_minutes: 25`；judge provider `judge-agent/generic/v1`。

### 探针与校准

- `verify-provider-gateway-v2.ts` 使用 TypeScript import graph + AST 分类，不接受纯正则启发式；职责见 spec。
- 校准基座复用 `injection-calibration/v2/node-ts/app-shell/v1`；overlays：public-starter、reference、equivalent、type-based、docs-present，以及 anti-patterns（retry 进适配器、per-provider 预算、双计费、流式漏账、伪兼容分支）。
- judge rubric 在模型运行前生成一次并固定 hash，三条件与模型档复用。

### 验证门禁

- `bun run validate`、OpenSpec strict、`git diff --check`、public/private 泄露审计、snapshot 校验、校准矩阵全绿。
- 独立 agent 真实环境验证并集成报告；不执行模型调用、不创建 record、不升级 suite。

## Risks / Trade-offs

- [复杂度过高导致 baseline 语义全 fail、无区分] → starter 只留最小可运行骨架，公开测试按可观察行为逐条覆盖；校准矩阵先验证 reference 可行性与 baseline 缺口。
- [租户预算并发语义难以确定] → 固定 `max_tokens` 预占 + 注册表最高输出单价 + 原子账本；stub 不引入真实时序，只依赖并发计数确定性断言。
- [伪兼容供应商被 agent 直接忽略或误复用] → 这是期望的判别信号；public tests 覆盖 Nebula 请求/响应/SSE 字段，probe 拒绝按名称复用。
- [探针过度拒绝等价实现] → import graph 分类与新增 equivalent/type-based 校准样例共同约束。
- [judge 轮间 rubric 漂移] → 固定 rubric hash，跨条件/模型档复用。
- [私有材料泄漏] → public 面只含 task/starter/tests/docs，所有私有物留在 private；泄露审计与独立 agent 审计门禁。
- [wall-clock 阈值] → 所有延迟只记录，测试不依据真实墙钟判定。

## Migration Plan

1. 已完成：创建 issue #166、确认六项决策、创建分支与 OpenSpec change 骨架。
2. 写回规划澄清到 #166；补全 proposal/specs/design/tasks；`openspec validate --type change --strict` 通过后提交并创建 OpenSpec-only 初始 PR。
3. 在同一分支实现 candidate：public task/starter/tests/stubs/docs、private manifests/practices/probe/evaluator/execution、calibration overlays、snapshot。
4. 运行校准矩阵、`bun run validate`、泄露审计、snapshot 校验、独立 agent 验证，持续提交到同一 PR。
5. 不执行模型调用、不创建 record；pilot 与 suite 升级后续另立 issue。

回滚：删除 `incubator/practice-injection/llm-provider-gateway-v2/` 与新增 overlay/夹具即可；不触碰 v1 与现有对象。

## Open Questions

六项需求方决策已于 2026-08-13 确认并写回 #166，无未决问题。

## Planning Confirmation

2026-08-13 确认：

1. 25 分钟/attempt，n=5/条件（15 attempts）。
2. 全量六项行为，保留幂等。
3. 语义测试全公开，不引入私有隐藏增长场景。
4. 供应商集合增加伪兼容陷阱 Nebula。
5. Practice `llm.provider-gateway.v2`，对照沿用 `backend.pagination`。
6. judge rubric 候选校准时固定并复用。
