# llm-provider-gateway-v2-practice-candidate Specification

## Purpose
TBD - created by archiving change llm-provider-gateway-v2. Update Purpose after archive.
## Requirements
### Requirement: 纯后端 REST 形态与确定性评测

`llm-provider-gateway-v2` candidate MUST 采用纯后端 TypeScript/Bun REST 服务形态（无浏览器 UI），公开面 MUST 提供 `POST /api/chat`（JSON 与 `Accept: text/event-stream` 的 SSE 两种模式）与 `GET /api/usage`（支持 tenant/model/status 维度）。评测 MUST 使用本地 stub HTTP 服务器模拟 OpenAI/DeepSeek、Anthropic 与伪兼容陷阱供应商 Nebula 的协议，MUST NOT 依赖真实网络。latency 只记录上报，MUST NOT 作为 wall-clock 通过阈值。

#### Scenario: 语义评测确定可复现

- **WHEN** 对 candidate 执行语义评测
- **THEN** 所有对话/流式/政策/计费断言基于本地 stub 与固定价目表，结果确定可复现，无真实网络依赖

#### Scenario: 延迟不参与硬门槛

- **WHEN** 评测记录每逻辑请求延迟
- **THEN** 延迟仅作为可观测字段保存，不作为 pass/fail 阈值

### Requirement: 占位 starter 制造行为级缺口

`public/starter` MUST 为真实占位：仅实现硬编码 OpenAI 非流式直连路径，无注册表/适配器/执行政策/租户预算/幂等/JSONL 账本或 `/api/usage`；Nebula、Anthropic、DeepSeek 与全部政策行为未接入。公开语义测试在占位状态下 MUST 为红。`public/task.md` MUST 以真实工单口吻声明可观察行为（供应商切换、协议映射、fallback/retry/预算/幂等、流式失败、用量与费用、统一错误），MUST NOT 写入文件路径、函数名或内部架构要求，MUST NOT 出现 benchmark/评分/评测痕迹。

#### Scenario: baseline 存在可观察缺口

- **WHEN** baseline 条件（无注入）基于占位 starter 完成 task
- **THEN** 语义硬门槛仍可判定，且至少一个新增执行政策行为存在可观察缺口或探针 not-observed

#### Scenario: oracle 能补上缺口

- **WHEN** oracle-practice 条件收到被测规范并完成同一 task
- **THEN** 语义硬门槛通过且职责探针记录被测职责被满足

### Requirement: 供应商注册表与协议映射

candidate MUST 以开放 providers 注册表承载供应商（不限于四家）：OpenAI 与 DeepSeek 为 OpenAI 兼容类并复用同一适配器，DeepSeek 仅改配置即可切换；Anthropic 使用 `messages` 线协议、`input_tokens/output_tokens` usage 与不同鉴权头，MUST 由独立适配器翻译；Nebula 为伪兼容陷阱供应商，路径形似 OpenAI 兼容（`/v1/chat/completions`），但鉴权为 `X-Nebula-Key`、响应为 `output_text`、usage 为 `input_tokens/output_tokens`、SSE 增量为 `delta.text`，MUST NOT 仅凭名称复用 OpenAI 兼容适配器。语义测试 MUST 覆盖四种协议形态的非流式与流式映射。

#### Scenario: OpenAI 兼容供应商等于纯配置

- **WHEN** 从 openai 注册项切到 deepseek 注册项（同一份代码）
- **THEN** 对话成功且不要求任何代码改动；若为兼容供应商新增独立请求路径，职责探针判 not-observed

#### Scenario: 伪兼容供应商必须按线协议映射

- **WHEN** 对 Nebula stub 发起非流式与流式请求
- **THEN** 请求满足 `X-Nebula-Key`/路径/请求体契约，`input_tokens/output_tokens` 与 `output_text` 被正确归一，不能因路径形似 OpenAI 而误用 OpenAI 字段映射

### Requirement: fallback 归属与单次计费

当主供应商返回 429、5xx 或超时，candidate MUST 切换到已配置 fallback 供应商继续完成逻辑请求；响应、日志、费用与模型归属 MUST 反映实际服务请求的供应商。fallback 后仍失败 MUST 返回统一领域错误。一个逻辑请求（含 retry/fallback 的所有传输尝试）MUST 只产生一条账本记录，MUST NOT 对失败尝试与成功尝试重复计费。

#### Scenario: 主供应商失败后降级成功

- **WHEN** 主供应商首次返回 429，fallback 供应商成功返回内容与 usage
- **THEN** 客户端收到 fallback 的归一化内容，日志与 `/api/usage` 的 provider/model/cost 归属 fallback，且只有一个逻辑请求被记账

#### Scenario: 主备都失败

- **WHEN** 主供应商与 fallback 均返回可重试或不可重试错误
- **THEN** 客户端收到统一领域错误，账本记录 status 为领域错误状态且 cost 为 0

### Requirement: retry 是传输细节且不双计费

candidate MUST 在边界执行 bounded retry（配置驱动），retry 只适用于可重试错误；retry/fallback 属于同一逻辑请求，MUST NOT 在适配器内自行重试。最终费用 MUST 只由实际返回 usage 的成功传输尝试产生；失败尝试 MUST 记录 retry_count/status，但 MUST NOT 产生额外费用或额外账本行。

#### Scenario: 重试后成功只计一次

- **WHEN** stub 对第一次传输返回 429、第二次返回成功 usage
- **THEN** 最终费用等于第二次成功 usage 的精确费用，`retry_count` 为 1，JSONL 只有一条逻辑请求记录

### Requirement: 跨供应商租户预算与并发原子性

请求 MUST 携带 `x-tenant-id`；candidate MUST 按租户在边界维护 USD 预算，且该预算跨供应商共享。当启用预算时，请求 MUST 提供 `max_tokens`；边界账本 MUST 使用注册表最高输出单价对 `max_tokens` 进行预占，预占不足时在调用供应商前返回 402 `budget_exceeded`，请求完成后 MUST 用实际费用结算并释放差额。预算检查、预占与结算 MUST 原子执行，并发请求 MUST NOT 导致超支。

#### Scenario: 预占与结算精确

- **WHEN** 租户预算允许本次预占且请求成功
- **THEN** 实际费用进入租户余额结算，预占差额被释放，`/api/usage` 的 remaining budget 与账本一致

#### Scenario: 并发请求不超支

- **WHEN** 两个并发请求的预占之和超过剩余预算
- **THEN** 恰好一个请求被接受并完成，另一个在调用供应商前收到 402 `budget_exceeded`，且租户余额不会低于账本记录的已结算费用

### Requirement: 幂等语义

`POST /api/chat` MUST 支持可选 `Idempotency-Key`。相同租户内相同 key 与相同规范化请求体 MUST 返回首次结果且不重复调用供应商、不重复计费；相同 key 与不同请求体 MUST 返回 409 `idempotency_conflict`。幂等缓存按租户隔离。

#### Scenario: 重复请求只计一次

- **WHEN** 同一租户用相同 key 和相同请求体提交两次
- **THEN** 两次响应等价，供应商只被调用一次，`/api/usage` 与 JSONL 只新增一条逻辑请求记录

#### Scenario: 同 key 不同请求体冲突

- **WHEN** 同一租户用相同 key 提交不同请求体
- **THEN** 返回 409 `idempotency_conflict` 且不调用供应商、不计费

### Requirement: 流式失败记账

对于 SSE 请求，candidate MUST 在首个 chunk 前识别上游失败并返回 JSON 领域错误；若 HTTP 头已发送后流失败，MUST 发送终止 SSE 错误事件 `data: {"error":{"code":"<domain-code>"}}` 并结束流。MUST 只记录上游实际报告的 usage（含流中分片 usage），MUST NOT 伪造最终 usage 事件，MUST NOT 在错误事件后再发成功 usage 事件。

#### Scenario: 首 chunk 前失败

- **WHEN** 上游在产生第一个 SSE chunk 前返回 429 或超时
- **THEN** 客户端收到 JSON 领域错误而非空的 200 流，且账本记录领域错误状态

#### Scenario: 流中途失败

- **WHEN** 上游已发送部分增量与部分 usage 后中断或返回错误
- **THEN** 客户端收到统一终止 SSE 错误事件，账本只记录上游已报告 usage，且不重复发送成功 usage 事件

### Requirement: 固定价目表、rounding 与观测聚合

candidate MUST 按固定 USD 价目表计算费用：openai gpt-4o $2.5/1M in、$10/1M out；deepseek-chat $0.27/1M in、$1.1/1M out；anthropic claude-sonnet $3/1M in、$15/1M out；nebula $1/1M in、$4/1M out。费用 = 输入 tokens × 单价in + 输出 tokens × 单价out，6 位小数四舍五入，规则 MUST 写入公开 API 文档。JSONL MUST 每逻辑请求一条，含 `tenant/provider/model/trace_id/retry_count/status/cost/latency_ms`；`GET /api/usage` MUST 按 tenant/model/status 过滤并按模型聚合请求数、tokens、费用、平均/最大延迟，按租户聚合请求数与余额。

#### Scenario: 聚合与 rounding 精确

- **WHEN** 多次请求（含流式、fallback、retry）后查询 `/api/usage` 的 tenant/model/status 维度
- **THEN** 聚合结果与逐条 JSONL 一致，费用与固定价目表及 6 位小数 rounding 精确一致

#### Scenario: 失败与流式均进入账本

- **WHEN** 发生 retry/fallback 或流式中途失败
- **THEN** 每个逻辑请求均有且仅有一条 JSONL 记录，status 反映最终领域状态，cost 只包含成功传输的 usage

### Requirement: 统一领域错误契约

candidate MUST 将上游差异归一为稳定领域错误：`authentication_failed`(401)、`rate_limited`(429)、`upstream_timeout`(504)、`budget_exceeded`(402)、`idempotency_conflict`(409)、`unsupported_provider`(400)、`invalid_request`(422)、`upstream_error`(502)。MUST NOT 向客户端泄漏原始供应商响应体、状态码细节或异常文本。

#### Scenario: 错误码稳定

- **WHEN** 触发无效 key、限流、超时、预算不足或幂等冲突
- **THEN** 客户端收到与公开文档一致的领域 code 与状态，响应不包含上游原始报文或内部异常文本

### Requirement: Practice 以项目内规范条件化注入

被测 Practice MUST 以项目内规范（`docs/ai-gateway-guide.md`）形态呈现并条件化：baseline 不收到任何规范，irrelevant-practice 只收到其声明的等长 `backend.pagination` 对照规范，oracle-practice 收到 `llm.provider-gateway.v2` 规范。规范 MUST NOT 进入共享 starter；公开痕迹 MUST 只记录规范版本与 hash，MUST NOT 记录规范文本。

#### Scenario: 条件隔离

- **WHEN** 三条件运行
- **THEN** oracle 只含被测规范，baseline 无规范，irrelevant 只含分页对照，且共享 starter 不含任何规范文档

#### Scenario: 规范不绑定私有路径

- **WHEN** 审阅 oracle 卡正文
- **THEN** 卡以“适配器只做 wire 翻译、执行政策集中、注册表驱动、一个逻辑请求一条账本”的建议与反模式表达，不出现 candidate 私有文件路径、函数名或 reference 布局作为达标条件

### Requirement: 职责可解释探针与模型运行前校准

私有质量探针 `verify-provider-gateway-v2.ts` MUST 按职责断言并名称无关地接受职责等价实现，MUST 使用 TypeScript import graph 与 AST 分类（handler/policy/registry/adapter/ledger），MUST NOT 依赖字符串正则启发式。职责至少包括：统一契约存在且业务只依赖它；HTTP/SDK 只在适配器内；OpenAI 兼容供应商复用同一适配器；伪兼容供应商不按名称误复用；费用/预算/重试/降级/幂等/计量集中在边界政策与账本；原始 usage/错误不外泄；选择由注册表驱动。校准 MUST 在任何模型调用前覆盖 public-starter、reference、equivalent、type-based、docs-present 及 fallback/retry/租户预算/双计费/流式漏账/伪兼容分支 anti-pattern；校准样例、probe 与断言 MUST 保持 private。

#### Scenario: 等价实现校准

- **WHEN** 维护者为 probe 提交校准样例
- **THEN** reference 与职责等价样例通过，anti-pattern 与文档在场负例失败，public-starter 记录缺口

#### Scenario: 校准未通过

- **WHEN** probe 拒绝职责等价样例、接受声明绕过，或任何新增 anti-pattern 不能被稳定分类
- **THEN** 该 candidate 不得进入模型比较，直到 probe/断言修正并重新校准

### Requirement: judge 软评分与 rubric 冻结

candidate MUST 在 `conditions.yaml` 声明 `judge-agent/generic/v1`（#153）作为打分制软评分。candidate MUST 在模型运行前由 judge 从公开材料生成一个 rubric 并固定 rubric hash，三条件与所有模型档 MUST 复用同一 rubric hash；judge 分数 MUST 与语义结果分开逐条件报告，MUST NOT 改变语义完成判定，MUST NOT 作为唯一 oracle。

#### Scenario: rubric 跨条件复用

- **WHEN** judge 对 baseline/oracle-practice/irrelevant-practice 评分
- **THEN** 所有条件引用同一 rubric hash，分数可解释为同一判据下的相对差异

### Requirement: 真实环境独立验证

candidate 的真实环境验证 MUST 由独立 agent 执行并留证：在真实运行环境跑 starter 语义测试（本地 stub、无模型调用）、经 kernel 跑校准矩阵、以全新 agent 视角审计暂存 workspace/prompt（无评分/condition/hash/评测字样、git 历史真实、starter 可运行），输出独立验证报告；主实现 agent MUST 集成该结果到实现 PR，不得以自评代替独立验证。

#### Scenario: 独立验证报告

- **WHEN** 实现完成 candidate
- **THEN** 独立 agent 输出真实环境验证报告，覆盖语义测试、校准执行与真实性审计，并被集成到实现 PR

### Requirement: 身份、执行预算与生命周期

`llm-provider-gateway-v2` MUST 作为独立 candidate revision 存在（独立 source/snapshot/profile 身份，`lifecycle_stage: candidate`），MUST NOT 改写 v1、现有 candidate、suite、treatments、共享 evaluator helper 或历史结果。`conditions.yaml` MUST 声明 `max_duration_minutes: 25` 与每条件重复次数 5，为后续三条件 pilot 提供固定分母；本 change MUST NOT 调用模型、创建正式 record 或升级 suite revision，本地 pilot 与 suite 升级 MUST 另立 issue。

#### Scenario: 现有对象不动

- **WHEN** 实现完成 candidate
- **THEN** v1 目录、suite、treatments 与历史结果保持不变，新 candidate 有独立 snapshot 与条件身份

#### Scenario: 不创建正式产物

- **WHEN** candidate 完成校准与验证
- **THEN** 未执行模型调用、未创建正式 record、未进入默认 suite

