## Context

#132 已合并到 main（PR #138），仓库现在有 `schemas/judge-result-v1.schema.json`
（状态、score、criteria、reason）与 `src/benchmark/outcome/v1/contract.ts`
（`assertJudgeResultV1`/`deriveJointPass`/`summarizeOutcomes`）及 10 个聚焦测试。
但该契约只有结果形状，没有 provider、输入构造、脱敏、provenance 和失败分类。

Issue #133 要求建立可复用的 JudgeAgent 软质量评分能力：通用接口、输入只含公开
材料、去除 condition/Practice/Oracle/私有路径、记录 model/version 与各类 hash、
mock provider（CI 不调用外部模型）、新任务可把 judge 结果作为可选 quality
artifact 引用，且 judge 只能产生软信号、不能改变语义硬门槛。

## Goals / Non-Goals

**Goals:**

- 完善 `judge-result/v1`（或按确认新增 v2）为完整软评分结果契约：judge
  model/version、prompt hash、rubric hash、input hash、状态、维度分数、理由、
  confidence。
- 在 `src/benchmark/judge/` 提供版本化 provider 接口、输入构造、脱敏、结构化输出
  校验和失败分类。
- 输入 allowlist：仅公开 task、candidate diff/source 与声明的公开运行材料；
  去除 condition、Practice、Oracle、私有 evaluator、私有路径。
- mock provider 输出合法、可校验、带完整 provenance；CI 默认不调用外部模型。
- 新任务可把 judge 结果作为可选 quality artifact 引用（独立 sidecar）。
- judge 只产生软质量信号，不改写 `evaluator-result/v2` 与语义硬门槛。

**Non-Goals:**

- 不实现登录页专用 rubric；不修改任何 candidate 或 task。
- 不在 CI 中执行真实外部模型评分；不调用模型。
- 不创建正式 record、不升级 candidate、不产生 snapshot。
- 不把总分转成产品或模型结论；不引入隐藏加权总分。
- 不改写 `evaluator-result/v2`、冻结 helper 或现有 runner 行为。

## Decisions

### judge-result/v1 扩展为新版本或 sidecar（待规划确认）

#132 的 `judge-result/v1` 尚无消费方和 record，可安全完善。默认推荐**在同一
schema 版本内扩展** `judge-result/v1`（增加 provenance 字段），避免多版本并存；
若需求方希望冻结 v1，则新增 `judge-result/v2`。该决策影响 schema 文件名与
`assertJudgeResultV1` 的版本断言，需在规划澄清阶段确认。

### 输入 allowlist 与脱敏

JudgeAgent 输入构造器 MUST 只接收声明为公开的材料：任务卡 `public/task.md`、
`public/starter/`、candidate diff/source 快照，以及显式声明的公开运行材料。
构造器 MUST 拒绝包含 condition、Practice 文本、Oracle、私有 evaluator、私有
路径或 calibration 材料的输入；脱敏检查作为输入校验的一环，失败即 fail closed。

### Provider 契约与 mock

`src/benchmark/judge/` 提供版本化 provider 接口：`score(input) -> result`，
结构化输出 MUST 通过 `assertJudgeResultV1`（或 v2 断言）与 JSON Schema 校验。
提供 mock provider（确定性打分，可从 rubric/输入 hash 推导），CI 默认使用
mock；真实 provider 仅通过显式环境变量/标志启用，且不在 CI 执行。

### 失败分类与 fail closed

缺失必填 hash、越权读取 private 内容、结构化输出非法、provider 不可用时
MUST fail closed：记录 `judge-unavailable` 或 `not-run` 状态与审计原因，不伪造
低分，不产出部分结果冒充完整结果。

### 任务引用 judge 结果

新任务在 task 卡或运行配置中可选声明 judge rubric 引用；judge 结果作为独立
quality artifact（sidecar）保存，`evaluator-result/v2` 不包含 judge 字段。

## Risks / Trade-offs

- [真实 provider 泄露私有输入] → 输入 allowlist + 脱敏校验在 provider 前强制执行；
  测试覆盖越权输入 fail closed。
- [provenance 缺失导致结果不可复现] → hash 必填并由 schema/断言强制。
- [judge 分数被当作硬门槛] → 契约明确 judge 只产生软信号，不改任务完成状态。
- [CI 意外调用外部模型] → CI 默认 mock，真实 provider 需显式启用且不在 CI 运行。

## Migration Plan

1. 创建本 OpenSpec-only PR（仅 artifacts），引用 #133，通过 strict validation。
2. 规划澄清：确认 judge-result/v1 扩展 vs v2、rubric 引用位置、artifact 引用方式。
3. 实现 schema 扩展/新版本、`src/benchmark/judge/` provider 与 mock、聚焦测试。
4. 运行 `bun run test:contracts`、`bun run validate`、`git diff --check` 与
   OpenSpec strict validation，保留证据。
5. 不执行模型调用、不创建 record、不升级 candidate。

回滚：删除新增 schema/代码/测试即可；不触碰 v2、冻结 helper 或历史记录。

## Open Questions

- `judge-result/v1` 在同一版本内扩展，还是新增 `judge-result/v2` 并冻结 v1？
- rubric 以独立文件 + rubric hash 引用，还是内联在 judge 请求中？
- judge 结果 artifact 引用挂在 run record 的哪个字段（独立 sidecar 还是
  manifest 字段）？默认：独立、版本化 sidecar。