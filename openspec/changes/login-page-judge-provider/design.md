## Context

v2 judge 已在 #145 上移为共享 helper（`src/benchmark/judge/practice-layered-api/v2/`）；
`src/benchmark/judge/` 已有 `JudgeProvider` 契约与确定性 `mock-judge`。
诊断 runner（`profile-diagnostic-runner.ts`）目前每个 attempt 只产出
semantic + practice_observation，不产出 judge sidecar。登录页复测（#146）需要
runner 可调用的 v2 judge 通道与明确的 SourceMap / indeterminate 协议。

## Goals / Non-Goals

**Goals:**

- 提供 `practice-layered-api/v2` judge provider（本地确定性，不调用模型），经
  provider 注册表可选。
- 定义 SourceMap 构造契约：从候选 workspace/app 构造判分输入，确定性（文件
  顺序无关）、排除生成目录、含 tsconfig（别名解析）、规范序列化 candidate_diff。
- runner 评估后运行候选声明的 judge provider，写 `judge.sidecar.json`，summary
  记录脱敏 judge 字段。
- 定义 indeterminate 协议：indeterminate attempt 保留在计划分母；条件级
  indeterminate 率超过声明预算 → 该候选 judge 通道 diagnostic-only；冻结计划绑定
  v2 rubric hash 与 criterion 级结果表。
- 契约测试 + 输入脱敏审计通过。

**Non-Goals:**

- 不修改 v2 判分逻辑本身（#144/#145 已收敛）。
- 不引入 LLM / 外部模型 judge provider。
- 不创建正式 record、不改 evaluator-result/v2 语义硬门槛与 joint_pass 派生规则。
- 不做多判分器融合或跨 rubric 比较。

## Decisions

### Provider 注册与选择

- 新增 `src/benchmark/judge/providers.ts`：注册表 `Record<judgeId, JudgeProvider>`，
  含 `mock-judge`（现有）与 `practice-layered-api/v2`。
- `practice-layered-api/v2` provider：`score(input, context)` 内把 candidate_diff
  解析回 SourceMap，加载共享 rubric（`practice-layered-api/v2/rubric-v2.yaml`），
  调 `scoreSourceV2`，返回 `judge-result/v1`（state=observed/indeterminate）。
- 选择方式：**按 candidate 显式声明**（`conditions.yaml`
  `shared_execution.judge.provider`），缺失时回退 `mock-judge`（全局默认）。

### SourceMap 构造契约

- `src/benchmark/judge/source-map.ts`：
  - `sourceMapFromWorkspace(appRoot)`：收集 app 下所有文件，排除生成目录
    （node_modules/dist/test-results/playwright-report/.git/.vite/.practice-runtime/
    .run-workspaces/logs），key=规范化相对路径，**按键排序**（确定性）。
  - `sourceMapToDiff(files)`：`Object.entries(files).sort()` 后按
    `path\0<length>\0<content>` 长度前缀格式以 `\n` 连接；长度前缀使含换行的内容
    也能无损 round-trip（`path\0content` 直接 `\n` 连接会与内容换行冲突）。
  - `sourceMapFromDiff(diff)`：解析回 SourceMap。
- 同一候选无论文件遍历顺序如何，SourceMap 与 diff 完全一致；tsconfig 包含在
  集合中供别名解析；非源码文件（如注入的 `docs/frontend-guide.md`）保留在集合中，
  判分器按源码扩展名过滤、不影响分数。

### Runner 接线

- `runAttempt`：评估（evaluate.ts）成功后，若候选声明了 judge provider：
  - 用 `sourceMapFromWorkspace(workspace/app)` 构造 SourceMap → diff。
  - `buildJudgeInput({ task_md, candidate_diff, rubric })`（复用私有标记拒绝）。
  - 运行 provider，`assertJudgeResultV1` 校验。
  - 写 `attemptPath/judge.sidecar.json`；DiagnosticEntry 增 `judge` 字段
    （脱敏：judge id/version、state、score、criteria、rubric_hash、input_hash、
    confidence、reason）。
- summary 增 `judge` 汇总（按条件的 observed/indeterminate 计数 + criterion 级表）。

### Indeterminate 协议

- indeterminate attempt 的 judge 结果保留在计划分母（不静默剔除）。
- 声明预算：`conditions.yaml` 或诊断计划可声明 `judge.indeterminate_budget`
  （默认 0.25）；某候选条件级 indeterminate 率 > 预算时，该候选 judge 通道标记
  `diagnostic-only`（不用于方向性结论，只作诊断）。
- 冻结计划模板须写明：v2 rubric hash、indeterminate 处理、criterion 级结果表、
  重复次数；baseline 分布先于结论解释。

## Risks / Trade-offs

- [SourceMap 集合过宽/过窄] → 排除生成目录、包含 tsconfig 的固定集合 + 契约测试；
  判分器只解析源码扩展名。
- [indeterminate 被误用为剔除] → 分母保留 + 预算门槛 + summary 明确计数。
- [provider 契约与既有 JudgeProvider 不兼容] → 复用现有 `score(input, context)`
  签名，`practice-layered-api/v2` 返回 `judge-result/v1`。
- [候选 diff 含治疗/注入内容] → buildJudgeInput 私有标记拒绝 + 侧车只落脱敏字段。

## Migration Plan

1. 创建本 OpenSpec-only PR（仅 artifacts），引用 #146，通过 strict validation。
2. 规划澄清：确认 provider 声明位置（conditions.yaml shared_execution.judge）、
   indeterminate 预算默认值（0.25）、SourceMap 排除集合（生成目录）。
3. 实现 source-map.ts + providers.ts + practice provider + runner 接线 + 协议
   文档，持续提交到同一 PR。
4. 契约测试、v5/v6 候选输出端到端 provider 冒烟（对比直接调 v2 判分器）、
   `bun run validate`、OpenSpec strict、`git diff --check`。
5. 不创建正式 record；复测 pilot 计划显式引用本协议。

回滚：删除 provider/source-map 与 runner 接线即可；不触碰 v2 判分逻辑与历史结果。

## Open Questions（默认已定，待确认）

- provider 声明位置：`conditions.yaml` `shared_execution.judge.provider`
  （默认 `practice-layered-api/v2`，缺失回退 mock）。
- indeterminate 预算：默认 0.25（超过则该候选 judge 通道 diagnostic-only）。
- SourceMap 集合：app 下全部文件排除生成目录，按键排序（确定性）。
