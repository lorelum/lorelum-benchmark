# Proposal

## Why

Issue #246：独立 Judge 的开发侧工作流缺少用户可直接操作与观察的完整验收路径，现有自主 Pack 框架又只运行 Pi。需要在 Benchmark 中以可见的真实任务、用户交互和独立验收呈现 Judge 的实际效果，并支持安装 Pack／空 Store 对照；复用公开任务与 verifier 不等于已具备自主 Lore 或可比较结果。

## What Changes

- 以 `config-migration-v2` 为首个候选案例，复用公开题面、starter 和独立私有 verifier，不修改已有版本与历史结果。
- 建立用户可实际操作的 Benchmark 宿主，展示资料披露、完整计划及版本、用户调整／拒绝／确认、独立权限授权、执行进度、候选差异、Judge 检查和 Benchmark 独立验收；用户能够观察 Judge 工作流的实际行为与结果。
- 为两组提供相同的自主 Lore 使用能力，固定空 Store 与安装 Pack 的各自身份；不可支持时保持阻塞或不可比较，不强制查询或预选／注入 Practice。
- 分开验收 Judge 的规划及调整、真实用户交互、授权边界、候选修改与独立功能结果；保留完整计划分母、可见检索、可选质量和成本，不能用一次模拟测试或汇总通过代替用户体验证据。
- 以 Linux 隔离及确定性模型替身验证真实管线和反向情形；模拟用户决定不能冒充真实人工验收。真实模型调用、正式 record 和最终交付需独立授权与相应生命周期条件。

## Capabilities

### New Capabilities

- `autonomous-pack-interactive-agent`: 需要真实用户确认与独立执行授权的编码 Agent 参与自主 Pack 配对时的交互、隔离、可比较性和不确定性边界。

### Modified Capabilities

无。现有 Pi 和历史运行语义不变；不把单个案例、某个 Judge 实现或个人预算作为跨任务规范。

## Impact

关联 #246。计划涉及 `schemas/`、`src/benchmark/autonomous-pack/`、`environments/` 和使用指南，必要时新增候选级案例配置；不修改已有公开任务、私有 verifier、冻结 revision 或 record。Judge #64/#67 目前为草稿且未发布，固定可重建依赖和可用 Lore 通道仍是实施前未决前提。具体结构和验证经初始 PR 后的实施计划确认，不在本提案阶段伪称已经可运行。
