## Context

#91 扩大样本语料已产生（多份 `profile-diagnostic-summary/v3`，落在 ignored `scratch/`），
#155 解释器核心与 #156 practice adapter 已合并并在登录页 Practice 上验证。本 change 把
#92 汇总做成一个可复用的"语料汇总 driver"：输入 #91 语料清单，逐份经 adapter + 核心判定，
输出逐单元结论 + 跨 candidate 诊断性分布 + 执行缺口，并以人读报告呈现，全程脱敏。

## Goals / Non-Goals

**Goals:**

- 多语料汇总 driver：清单 → 每份 summary 的 unit 判定 → 语料级聚合（仅分布 + 缺口）。
- 人读脱敏报告 + 机器可读 JSON，每条结论映射 source_commit / snapshot_id / profile_input_hash。
- #75 单列为不可比历史背景；缺口路径输出 uncertain；无加权总分、无聚合 signal。

**Non-Goals:**

- 不创建正式 run manifest / record / suite revision；不执行 retrieval、盲评、成本/时延统计
  或 Wiki 发布。
- 不修改 `result-interpreter/v1`、practice adapter 或 runner 逻辑。
- 不把少量 candidate 信号表述为产品或通用模型能力结论。

## Decisions

### 输入：语料清单（多份 v3 summary）

driver 接受一个语料清单（JSON 或目录约定），每项指向一份 `profile-diagnostic-summary/v3`。
每份经 practice adapter 构造 unit，再经 `interpret()` 得到 `result-interpreter-summary/v1`。
不同 source_commit / snapshot_id / profile_input_hash 天然分属不同 unit，绝不合并分母。

### 输出

- 机器可读：每份 summary 一个 `result-interpreter-summary/v1`；语料级聚合 JSON 只含
  verdict 分布与 execution_gaps。
- 人读：脱敏 markdown 报告：按 candidate × profile_input_hash 列 verdict、证据链、各条件
  joint_pass/原始计数、原因；跨 candidate 给分布与缺口；末尾按 #92 成功/失败/不确定收口。

### 缺口与不确定

缺失 summary、未完成候选、执行异常 → 列入 execution_gaps，overall `uncertain`。只对完整
且同输入身份单元给 `signal` / `diagnostic-only`。

### #75 历史背景

#75（非-kernel 历史候选）结果单独一节，标注"历史背景、不可比较"，不进入判定与分母。

### quality gap 复核（#156 遗留 N1）

#92 按真实语料复核：`practice_observation=not-run` 或 judge 不可用是否升级为缺口 →
`uncertain`。默认维持 #155 v1（仅 `indeterminate` 为缺口），若语料中出现 `not-run` 且
影响结论，则由需求方确认后调整（核心 `gapQualityStates` 一处即可）。

## Risks / Trade-offs

- [语料分散/缺失] -> 语料清单显式列出，缺失项记为缺口，不静默跳过。
- [泄露风险] -> 报告只由已校验字段生成，输出前做泄露断言。
- [与旧 report 口径差异] -> 以解释器口径为准，差异记录为口径说明。

## Migration Plan

1. Strictly validate this change and create its OpenSpec-only PR for #92.
2. Obtain planning confirmation and write it back to this design and `tasks.md`.
3. Enumerate the #91 corpus; implement driver + tests; replay and write redacted report.
4. Deliver the audit summary as #92 evidence; #92 does not create formal records.

## Planning Confirmation

需求方已确认以下口径（2026-08-08，plan-mode 提问，全部按推荐）：

- 语料范围：两个 v2 candidate 的三重复（`v2-full-run` 18 attempts；pdir 的 oracle block-3
  超时用 `v2-rerun-pdir` 按槽位替换）+ 登录页 `login-v2-three-condition-retest-v2`；
  v1 gate/one-repeat 不纳入判定。
- quality-gap 口径：维持 #155/#156 v1（仅 `indeterminate` 视为缺口 → uncertain；
  not-run / judge-unavailable 按“非 observed”处理；本语料无这两类状态，不影响结果）。
- 输出格式：机器可读 JSON（corpus-report + 逐单元）+ 人读脱敏 markdown 报告。

补跑合并遵循 #91 N2 分母规则：补跑只替换失败/缺失槽位、不新增分母、不跨 plan 合并计数；
目标槽位已 evaluated 或替换条目非 evaluated → fail-closed。