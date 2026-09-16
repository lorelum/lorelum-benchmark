## Why

Issue #196（https://github.com/lorelum/lorelum-benchmark/issues/196）需要一个自包含、可重复的异步报表生命周期 candidate，才能在同一个长任务会话中比较 Practice 的不同送达时机。当前仓库没有能同时暴露排队、分段进度、检查点暂停/继续、旧新版本并行和回退安全的公开 starter；若先实现 runner 或 evaluator，会把尚未稳定的任务语义和边界倒置。

## What Changes

- 在 `incubator/practice-injection/async-report-lifecycle-v1/` 建立 candidate 目录，保留正式候选源码与 snapshot。
- 新增仅包含 Agent 可见任务题面和 starter 的 `public/` 输入，覆盖异步报表生命周期以及后续用户补充的兼容/回退约束场景。
- 新增固定的多回合公开任务脚本：Agent 先检查代码并提出初步方案，用户随后补充旧客户端/后台任务并行及可回退约束，Agent 必须复查后进入实施和验证。
- 明确首个实现检查点、任务语义硬门槛和 candidate 生命周期状态，为后续 #197 runner、#202 evaluator、#199 treatment 和 #200 JudgeAgent 提供稳定边界。
- 保持所有 evaluator、oracle、calibration、scoring、treatment 正文和其他私有运行材料不进入 Agent workspace 或公开任务。
- 本 change 只建立 candidate fixture 和公开任务情境；不修改 active suite，不冻结 task revision，不创建正式 record，不调用模型。

## Capabilities

### New Capabilities

- `async-report-lifecycle-candidate`: 定义异步报表生命周期 candidate 的公开任务、starter、三阶段会话语义、首个实现检查点、public/private 边界、不可变源码快照和 candidate 验收门槛。

### Modified Capabilities

无。

## Impact

- 新增 `incubator/practice-injection/async-report-lifecycle-v1/public/` 和候选元数据/快照所需的私有源文件；具体 private evaluator/oracle/calibration 由后续 #202 change 负责。
- 不修改现有 suite、共享 evaluator helper、Pi staged runner、Practice treatment、environment 或正式运行记录。
- 后续实现必须在同一 OpenSpec change 的初始 PR 上继续追加，并在 candidate 代码出现前完成规划澄清和 public/private 泄露审计。
