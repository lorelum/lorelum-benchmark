## Context

现有 practice-injection candidate 全部是 React 前端单请求任务（登录页、资料更新、项目目录），被测 Practice 集中在「前端分层职责边界」，评分维度只有分层探针 + 6 维 rubric，无法体现「跨模块架构收益」类 Practice。issue #161 提出新建一个更复杂的后端 candidate：多供应商 LLM 网关接入 + 可观测性（模型性能与费用计费），验证「设计通用供应商接口 + 边界观测 + 集中计费」这一 Practice 的判别力。本 change 参照 `login-page-auth-flow-v2` 与 `practice-injection-candidates-v2`（#151）沉淀的 v2 模板，落地一个纯后端形态 candidate。

## Goals / Non-Goals

**Goals:**

- 新建 `incubator/practice-injection/llm-provider-gateway-v1/`（纯后端 TypeScript/Bun REST candidate，独立 source/snapshot/profile 身份）。
- 真实工单口吻 task.md（接入协议不同的 Anthropic、OpenAI 兼容类供应商只改配置即可切换、支持 SSE 流式、提供用量/费用可观测）+ 占位 starter（仅硬编码 OpenAI 直连路径，无抽象/无记账/无 `/api/usage`）。
- 语义硬门槛由本地 stub HTTP 服务器承担（模拟 OpenAI/DeepSeek 同形、Anthropic 异形协议，含 SSE），确定性、无真实网络、无浏览器 UI。
- Practice 以项目内规范 `docs/ai-gateway-guide.md` 条件化注入（`project-convention/v1`，oracle/irrelevant 可见、baseline 不可见）。
- 质量评分：`conditions.yaml` 声明 `judge-agent/generic/v1`（#153）打分制软评分 + 职责探针 `verify-provider-gateway.ts`，与语义结果分开逐条件报告。
- 新增后端校准基座 `incubator/calibration-bases/injection-calibration/v2/node-ts/app-shell/v1/`，校准矩阵 5 类固定样例 + judge 判别力验证。
- 生成并校验 snapshot，通过 public/private 泄露审计、`bun run validate`、OpenSpec strict；task.md 先提交需求方审批；真实环境验证由独立 agent 执行。

**Non-Goals:**

- 不改写任何现有 candidate、suite、treatments、执行计划与 scratch/record 结果。
- 不调用模型、不创建正式 record、不升级 suite revision；candidate 先留在 incubator 做本地三条件对照。
- v1 不含 function calling/tool use、多租户配额、自动重试、多币种汇率；更多异形供应商（第二家非 OpenAI 兼容协议）留作 v2 扩展。
- 不新建 per-candidate 静态 judge（复用 #153 `judge-agent/generic/v1`）；不覆盖 runner、检索或正式执行。

## Decisions

### 形态：纯后端 REST + 本地 stub（已确认）

- candidate 为 TypeScript/Bun REST 服务，无浏览器 UI；公开面 `POST /api/chat`（JSON 与 `Accept: text/event-stream` 的 SSE 两种模式）、`GET /api/usage`（按模型聚合：请求数/total tokens/总费用/平均与最大延迟）、错误契约（认证失败/限流/超时 → 统一领域错误）、config 开放 providers 注册表（provider/model/api_key/base_url/单价）。
- 评测不依赖真实网络：evaluator 起本地 stub HTTP 服务器模拟 OpenAI/DeepSeek（OpenAI 兼容，`chat.completions` 形状）与 Anthropic（`messages` 形状，鉴权头/请求体/usage 字段/SSE 格式不同）；公开测试与私有语义评测都用这些 stub。
- latency 只记录上报，不作 wall-clock 阈值（仓库禁止 `wall_clock_thresholds`）。

### 占位 starter 制造 Practice 可观测缺口

- starter 仅实现 OpenAI 直连路径（硬编码 provider/model/base_url/key 使用位置），无统一契约、无适配器、无记账、无 `/api/usage`；Anthropic/DeepSeek 未接入；公开测试红（真占位）。
- 公开任务以自然语言声明可观察行为（两家供应商对话可用、切换只改配置、流式可用、用量/费用可查、错误可读），不写适配器/分层/文件路径等内部架构要求；baseline 有机会完成语义但通常以「硬编码二供 + 复制计费」方式达成 → 语义 pass + practice not-observed 的判别路径成立。

### 供应商集合与判别力（已确认）

- v1 代码内供应商 = OpenAI（现有，OpenAI 兼容）+ Anthropic（新增，协议不同）；DeepSeek 作为 OpenAI 兼容示例进 config 注册表，且「只改配置即可切换 DeepSeek」是语义硬门槛。
- 判别力押在两点：① OpenAI 兼容类供应商=纯配置（DeepSeek 切换不改代码，naive 若为此新增独立路径即被探针拒绝）；② 协议不同类=一个适配器（Anthropic 的 `input/output_tokens` 与 `prompt/completion_tokens` 映射、SSE 归一、鉴权差异，naive 复制粘贴或字段映射错会导致费用错误，被语义门禁或探针捕获）。
- 供应商注册表开放，不限于三家。

### 计费口径（已确认）

- 固定 USD 价目表：openai gpt-4o $2.5/1M in、$10/1M out；deepseek-chat $0.27/1M in、$1.1/1M out；anthropic claude-sonnet $3/1M in、$15/1M out；费用 = 输入 tokens × 单价in + 输出 tokens × 单价out，6 位小数四舍五入，rounding 规则写入公开 API 文档。
- 不引入多币种/汇率。

### 观测输出（已确认）

- JSONL 结构化请求日志（每请求一条：provider/model/stream/latency_ms/prompt_tokens/completion_tokens/cost/status）+ `GET /api/usage` 聚合查询；测试确定性读取日志与聚合接口；无产品内 `window.__` 类埋点，产品代码真实调用网络。

### Practice 粒度与无关对照（已确认）

- 单卡三建议 `llm.provider-gateway`：① 统一模型客户端契约（请求/响应/usage/错误归一），业务与 API 层只依赖契约；② 每供应商一个适配器——OpenAI 兼容类复用兼容适配器（配置决定 base_url/model/key），协议不同类实现独立适配器；SDK/HTTP 只在适配器内；③ 供应商选择由配置/注册表驱动，业务路径不按供应商名分支；usage→费用换算与观测（usage/latency/cost）集中在边界。
- 反模式：业务直接 import SDK、复制粘贴每家一套请求/计费路径、把 `input/output_tokens` 当 `prompt/completion_tokens` 算钱、原始 provider 错误码外泄、产品埋点。
- 无关对照卡 `backend.pagination`（分页/列表约定），与 oracle 卡等长（±10%），与被测维度正交。
- 注入：`project-convention/v1` 物化 `docs/ai-gateway-guide.md`，baseline 无该文件，oracle/irrelevant 条件可见；git-history.yaml + 条件注入复现；trace 只记录版本与 hash。

### 语义硬门槛（oracle assertions）

1. OpenAI stub 非流式 + 流式对话成功；
2. DeepSeek（OpenAI 兼容）仅改 config 注册项即可切换、同一份代码对话成功；
3. 切到 Anthropic stub（同一份代码）非流式 + 流式对话成功；
4. `/api/usage` 费用精确匹配（三家各自的 usage 字段映射正确、多次请求聚合、按模型分组、rounding）；
5. 流式请求同样记账；
6. 无效 key → 认证错误、限流 → 领域错误（不泄漏原始状态码）；
7. 保护约束（config/key 不入库、不硬编码密钥、只允许改声明范围文件、依赖清单不变）。

### 职责可解释探针（verify-provider-gateway.ts）

按职责断言、名称无关地接受等价实现：统一契约存在且业务只依赖它；供应商 SDK/HTTP 只出现在适配器内；OpenAI 兼容供应商不新增独立路径（复用同一适配器）；费用换算集中（适配器只返回规范化 usage）；原始 provider 响应/错误不外泄；选择走配置/注册表；观测在客户端边界统一发出。

### 打分制 rubric 评分（仓库级通用 LLM JudgeAgent，依赖 #153）

- `conditions.yaml` 声明 `judge.provider: judge-agent/generic/v1`，不新建 per-candidate 静态 judge。
- rubric 维度：可扩展性（兼容类≈配置、异形类≈一个适配器）、契约一致性（含流式归一）、可观测性完整度、计费正确性、错误翻译、配置与密钥处理、测试性与结构、真实性（无假埋点）。
- judge 分数作为软质量信号逐条件报告，不改变语义完成判定；方向性决策按 joint-pass（semantic + practice_observation）。

### task.md 审批门禁与独立验证（已确认）

- task.md 草稿完成后先提交需求方审批；审批通过后才生成 snapshot、进入校准与验证。
- 真实环境验证由独立 agent 执行（starter 语义测试、校准矩阵、agent 视角真实性审计、泄露审计），主实现 agent 集成其结果，不以自评代替。

## Migration Plan

1. 已创建 OpenSpec change（本 change）并通过 strict validation；下一步创建仅含 OpenSpec artifacts 的初始 PR，引用 #161。
2. 规划澄清 7 项决策写回 issue #161 与本 design 的 Planning Confirmation。
3. 草拟 `public/task.md` 并提交需求方审批；审批通过后进入实现。
4. 实现 candidate（public/private、starter + git-history、conditions/oracle/evaluator、probe、calibration base + overlays、practices、snapshot），持续提交到同一 PR。
5. 跑校准矩阵（5 类样例）+ judge 校准 + 离线缺口验证 + public/private 审计 + `bun run validate` + OpenSpec strict + `git diff --check`；独立 agent 真实环境验证并集成。
6. 不执行正式 benchmark、不创建 record、不升级 suite revision。

回滚：删除 `incubator/practice-injection/llm-provider-gateway-v1/` 与 `incubator/calibration-bases/injection-calibration/v2/node-ts/app-shell/v1/` 即可；不触碰现有 candidate 与历史记录。

## Open Questions

已全部确认（见 Planning Confirmation）。

## Planning Confirmation (2026-08-10, confirmed on #161)

1. **形态**：纯后端 TS + REST，无浏览器 UI；评测用本地 stub HTTP 服务器模拟各供应商协议（含 SSE），确定性、无真实网络。
2. **流式**：v1 包含 SSE 流式输出（两家流式协议不同，作为复杂度与判别力来源）。
3. **计费口径**：固定 USD 价目表 + 明确 rounding（6 位小数四舍五入），费用可精确断言。
4. **观测输出**：JSONL 结构化请求日志 + `GET /api/usage` 聚合查询；latency 只记录，不作 wall-clock 阈值。
5. **Practice 粒度**：单卡三建议（统一契约 + 每供应商适配器 + 配置/注册表驱动且边界集中记账/观测）；无关对照为分页/列表约定，等长 ±10%。
6. **无关对照**：`backend.pagination` 分页/列表约定，与被测维度正交。
7. **供应商集合**：v1 代码内 = OpenAI（现有）+ Anthropic（新增异形协议）；DeepSeek 作为 OpenAI 兼容示例进 config 注册表，且「只改配置即可切换」作为语义硬门槛；注册表开放，不限于三家。