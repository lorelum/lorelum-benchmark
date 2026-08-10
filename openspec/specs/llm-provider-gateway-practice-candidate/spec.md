# llm-provider-gateway-practice-candidate Specification

## Purpose
定义多供应商 LLM 网关 Practice candidate（`llm-provider-gateway-v1`）的要求：纯后端 REST + SSE 流式 + 固定 USD 计费 + 结构化日志与聚合 API；开放供应商注册表（OpenAI 兼容类=纯配置、协议不同类=一个适配器）；单卡三建议 Practice 与分页无关对照；语义硬门槛（DeepSeek 只改配置可切、Anthropic 同代码切换、usage 字段映射与费用精确断言、错误领域化、保护约束）；职责探针与模型运行前校准；不调用模型、不建正式 record、不升级 suite。
## Requirements
### Requirement: 纯后端 REST 形态与确定性评测

`llm-provider-gateway-v1` candidate MUST 采用纯后端 TypeScript/Bun REST 服务形态（无浏览器 UI），公开面 MUST 提供 `POST /api/chat`（JSON 与 `Accept: text/event-stream` 的 SSE 两种模式）、`GET /api/usage`（按模型聚合：请求数、total tokens、总费用、平均/最大延迟）与统一错误契约（认证失败/限流/超时 → 领域错误）。评测 MUST 使用本地 stub HTTP 服务器模拟供应商协议（OpenAI/DeepSeek 同形、Anthropic 异形，均含 SSE），MUST NOT 依赖真实网络；latency 只记录上报，MUST NOT 作为 wall-clock 通过阈值。

#### Scenario: 语义评测确定可复现
- **WHEN** 对 candidate 执行语义评测
- **THEN** 所有供应商对话/流式/用量/费用断言基于本地 stub 服务器与固定价目表，结果确定可复现，无真实网络依赖

#### Scenario: 延迟不参与硬门槛
- **WHEN** 评测记录每请求延迟
- **THEN** 延迟仅作为可观测字段保存，不作为 pass/fail 阈值

### Requirement: 占位 starter 制造 Practice 可观测缺口

`public/starter` MUST 为真实占位：仅硬编码 OpenAI 直连路径（无统一契约、无适配器、无记账、无 `/api/usage`），Anthropic/DeepSeek 均未接入；公开语义测试在占位状态下 MUST 为红（真实缺口），完整实现后才通过。`public/task.md` MUST 以真实工单口吻声明可观察行为（两家供应商对话可用、切换只改配置、流式可用、用量/费用可查、错误可读），MUST NOT 写入适配器/分层/文件路径等内部架构要求。

#### Scenario: baseline 存在可观测缺口
- **WHEN** baseline 条件（无注入）基于占位 starter 完成 task
- **THEN** 语义硬门槛可判定，且职责探针记录 baseline 在至少一个被测职责维度未遵循 Practice（通常为硬编码二供 + 复制计费或按供应商名分支）

#### Scenario: oracle 能补上缺口
- **WHEN** oracle-practice 条件收到被测规范并完成同一 task
- **THEN** 语义硬门槛通过且职责探针记录被测职责被满足（统一契约、适配器隔离、集中记账/观测、配置驱动选择）

### Requirement: 供应商集合与判别力

candidate MUST 以开放 providers 注册表承载供应商（不限于三家）：v1 代码内 MUST 包含 OpenAI（现有，OpenAI 兼容）与 Anthropic（新增，协议不同）两个真实接入，并把 DeepSeek 作为 OpenAI 兼容示例写入 config 注册表。语义硬门槛 MUST 验证：① OpenAI stub 非流式+流式对话成功；② DeepSeek 仅改 config 注册项即可切换、同一份代码对话成功；③ 切到 Anthropic stub（同一份代码）非流式+流式对话成功。usage 字段映射 MUST 正确（Anthropic `input/output_tokens` 与 OpenAI/DeepSeek `prompt/completion_tokens` 归一为统一计量），费用 MUST 按固定 USD 价目表与明确 rounding 精确计算。

#### Scenario: 兼容供应商=纯配置
- **WHEN** 从 openai 注册项切到 deepseek 注册项（同一份代码）
- **THEN** 对话成功且不要求任何代码改动；若实现为兼容供应商新增独立请求路径，职责探针判 not-observed

#### Scenario: 异形供应商映射正确
- **WHEN** 对 Anthropic stub 发起非流式与流式请求
- **THEN** `input/output_tokens` 被正确归一到统一 usage 并进入费用计算，`/api/usage` 费用与固定价目表精确一致；错误映射为领域错误

### Requirement: 计费与观测正确性

candidate MUST 按固定 USD 价目表（openai gpt-4o $2.5/1M in、$10/1M out；deepseek-chat $0.27/1M in、$1.1/1M out；anthropic claude-sonnet $3/1M in、$15/1M out）计算费用：费用 = 输入 tokens × 单价in + 输出 tokens × 单价out，6 位小数四舍五入，rounding 规则 MUST 写入公开 API 文档。candidate MUST 提供 JSONL 结构化请求日志（每请求：provider/model/stream/latency_ms/prompt_tokens/completion_tokens/cost/status）与 `GET /api/usage` 聚合查询；流式请求 MUST 同样记账；费用/用量计算与观测 MUST 集中在边界（不散落在各供应商路径里重复）。

#### Scenario: 聚合与 rounding 精确
- **WHEN** 多次请求（含流式）后查询 `/api/usage`
- **THEN** 按模型分组的请求数、total tokens、总费用与逐请求 JSONL 记录一致，rounding 符合公开文档规则

#### Scenario: 无产品埋点
- **WHEN** 审计产品代码与公开测试
- **THEN** 产品代码不含 `window.__*` 或等价测试埋点；用量/延迟来自真实网络调用与边界观测，而非假计数器

### Requirement: Practice 以项目内规范条件化注入

Practice MUST 以项目内规范（`docs/ai-gateway-guide.md`）形态呈现，并 MUST 条件化：baseline 不收到任何规范，irrelevant-practice 只收到其声明的无关对照规范（`backend.pagination` 分页/列表约定，与 oracle 卡等长 ±10%），oracle-practice 收到被测规范（`llm.provider-gateway` 单卡三建议）。规范 MUST NOT 进入共享 starter；公开痕迹 MUST 只记录规范版本与 hash；trace MUST NOT 记录规范文本。

#### Scenario: oracle 看到项目内规范
- **WHEN** oracle-practice 条件运行
- **THEN** 被测规范以项目文档形式存在于 workspace；baseline 无任何规范，irrelevant 只含其对照规范

#### Scenario: 规范可迁移且不绑定文件
- **WHEN** 审阅 oracle 卡正文
- **THEN** 卡以「统一契约/适配器/配置驱动/边界记账与观测」建议 + 反模式表达，不出现 candidate 私有文件路径、函数名或 reference 布局作为达标条件

### Requirement: 职责可解释探针与模型运行前校准

私有质量探针 `verify-provider-gateway.ts` MUST 按职责断言（required responsibilities / forbidden responsibilities）并名称无关地接受职责等价实现：统一契约存在且业务只依赖它；供应商 SDK/HTTP 只出现在适配器内；OpenAI 兼容供应商不新增独立路径；费用换算集中；原始 provider 响应/错误不外泄；选择走配置/注册表；观测在客户端边界统一发出。校准 MUST 在任何模型调用前完成固定样例：占位 starter（semantic=fail, not-observed）、reference（pass, observed）、equivalent 不同命名/目录（pass, observed）、anti-pattern 硬编码二供+复制计费+usage 映射错+按供应商名分支（pass, not-observed）、「文档在场但代码不遵守」负例（pass, not-observed）。校准样例、probe 与断言 MUST 保持 private；探针或 Practice 修改后 MUST 重新校准并更新 snapshot。

#### Scenario: 等价实现校准
- **WHEN** 维护者为探针提交校准样例
- **THEN** reference 与职责等价样例通过，anti-pattern 与文档在场负例失败（not-observed），占位 starter 记录缺口

#### Scenario: 校准未通过
- **WHEN** 探针拒绝职责等价样例或接受声明绕过
- **THEN** 该 candidate 不得进入模型比较，直到探针/断言修正并重新校准

### Requirement: 打分制 rubric 评分与软信号分离

candidate MUST 在 `conditions.yaml` 声明 `judge-agent/generic/v1`（#153）作为打分制评分：judge 读 `task.md` 与公开材料生成评分标准并按标准对 candidate diff 打分，产出 `judge-result/v1`。rubric 维度 MUST 覆盖：可扩展性（兼容类≈配置、异形类≈一个适配器）、契约一致性（含流式归一）、可观测性完整度、计费正确性、错误翻译、配置与密钥处理、测试性与结构、真实性（无假埋点）。judge 分数 MUST 作为软质量信号与语义结果分开逐条件报告，MUST NOT 改变语义完成判定，MUST NOT 作为唯一 oracle；方向性决策按 joint-pass（semantic=pass 且 practice_observation=observed）。

#### Scenario: criterion 级缺口表
- **WHEN** 用通用 judge 重评 baseline/oracle 构造样例
- **THEN** 产出 criterion 级表格：baseline 硬编码二供/复制计费样例显著低分，oracle 统一契约+集中记账样例高分

#### Scenario: anti-pattern 分离
- **WHEN** 通用 judge 在 reference/equivalent/anti-pattern 夹具上校准
- **THEN** reference 与 equivalent 高分且接近，anti-pattern 低分且与 reference 拉开差距，各维度方向正确

### Requirement: 真实环境独立验证

candidate 的真实环境验证 MUST 由独立 agent 执行并留证：在真实运行环境跑 starter 语义测试（本地 stub、无模型调用）、经 kernel 跑校准矩阵、以全新 agent 视角审计暂存 workspace/prompt（无评分/condition/hash/评测字样、git 历史真实、starter 可运行），输出独立验证报告；主实现 agent MUST 集成该结果到实现 PR，不得以自评代替独立验证。

#### Scenario: 独立验证报告
- **WHEN** 实现完成 candidate
- **THEN** 独立 agent 输出真实环境验证报告，覆盖语义测试、校准执行与真实性审计，并被集成到实现 PR

#### Scenario: 独立性保持
- **WHEN** 独立 agent 执行验证
- **THEN** 验证不依赖实现 agent 的结论，且不涉及模型调用

### Requirement: 身份与历史保留、不建正式产物

`llm-provider-gateway-v1` MUST 作为独立 candidate 存在（独立 source/snapshot/profile 身份，`lifecycle_stage: candidate`），MUST NOT 改写任何现有 candidate、suite、treatments、执行计划或 scratch/record 结果。本 change MUST NOT 调用模型、创建正式 record 或升级 suite revision；candidate 先留在 incubator 做本地三条件对照，suite 升级须另立 issue 与 OpenSpec change。

#### Scenario: 现有对象不动
- **WHEN** 实现完成 candidate
- **THEN** 现有 candidate 目录、suite、treatments 与历史结果保持不变，新 candidate 有独立 snapshot 与条件身份

#### Scenario: 不创建正式产物
- **WHEN** candidate 完成校准与验证
- **THEN** 未执行模型调用、未创建正式 record、未进入默认 suite

