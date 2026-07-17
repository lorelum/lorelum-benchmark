# Benchmark 协议

本仓库为两个有关联但结论彼此独立的问题维护可复现的编程任务：

| 轨道 | 问题 | 必需条件 |
| --- | --- | --- |
| `practice-effectiveness` | 相关的团队 Practice 是否能改善编码结果？ | 基线、Oracle Practice、Lorelum 检索、无关 Practice |
| `performance-skill-comparison` | 在可比覆盖度下，Lorelum 检索能否达到或优于 Vercel React Skill？ | 基线、Vercel Skill、Lorelum 检索 |

两条轨道共用任务卡、评测器、运行记录和评审流程，但不共享结论：外部性能 Skill
不能证明团队特定的 Practice 检索有效，Oracle Practice 实验也不能证明与 Vercel
Skill 的能力对等。

## 实验条件

- `baseline` (`G0`)：不注入 Practice、Vercel Skill，也不执行 Lorelum 查询。
- `oracle-practice`：注入评审者选定的相关 Practice 内容，用于隔离内容本身和注入
  格式的价值。
- `lorelum-retrieval` (`G2`)：由 Lorelum 选择并返回 Practice 内容，衡量完整产品链路；
  在 CLI 可用前暂缓执行。
- `irrelevant-practice`：注入长度可比但刻意无关的 Practice，用于控制额外上下文而非
  相关性带来的影响。
- `vercel-skill` (`G1`)：启用固定版本的 Vercel React Skill，仅适用于外部性能对比轨道。

每组对比运行必须使用相同的任务版本、初始代码、模型及模型版本、系统 prompt、工具
权限、token/时间预算和干净工作目录。实验条件是唯一预期差异。

## 任务卡契约

每个不可变任务版本包含：

```text
tasks/task-slug/v1/
  public/
    task.yaml     # 稳定元数据和适用条件
    task.md       # 编码 Agent 可见的任务题面
    starter/      # 复制到干净运行工作区的初始代码
  private/
    evaluator/    # Agent 完成后执行的自动检查
    oracle.yaml   # 仅供 evaluator 使用的预期知识和评分断言
    snapshot.json # 已提交的正式任务文件 SHA-256 manifest
```

runner 只能将 `public/task.md` 和 `public/starter/` 复制到编码 Agent 的工作区，
绝不能复制 `private/` 或 `oracle.yaml`。任务题面必须描述目标产品行为，不得点名或
引用预期 Practice。

`practice-effectiveness` 的 pilot 任务必须有一到两条独立评审过的 Oracle Practice，
并具备能区分“可运行但不合规”与“合规”结果的验收检查。缺少可复现检查、答案泄露或
不可避免的外部依赖的任务均不合格。

## 数据集扩展

维护真实 Lorelum 任务的候选池，先冻结 6 张 pilot 任务卡，再扩展到 8–12 个正式的
Practice 有效性任务。性能轨道从 8 个类别 smoke 任务开始，只有在
`manifests/coverage.yaml` 将每条外部基线规则映射到至少一个任务后才可扩展。

修改 prompt、starter 代码、evaluator、Oracle 映射、treatment 或模型设置时，应视情况
创建新的任务、treatment、环境、scorer 或 suite 版本。既有运行记录不可修改。每个任务
还固定 `evaluator_version`；共享 evaluator helper 的行为变化必须创建新的版本目录。
退休版本保留在原 suite 路径，只从默认活动集合中移除，仍可被显式运行。

## 运行记录

每个 JSON 对象代表一次任务执行。正式运行还必须有受
`schemas/run-manifest.schema.json` 约束的不可变 manifest。运行记录和 manifest 共同
固定 suite/case 版本、treatment、scorer、Agent、模型、系统 prompt、工具权限、环境、
源码 commit、随机种子、预算、输入 hash、snapshot id、成本/延迟、代码 diff 位置、自动
检查和盲审结果。

这样两条轨道可使用同一数据集而不会覆盖彼此证据。每份不可变记录存放于
`results/records/<suite>/<task>/<run_id>.json`；大日志和 diff 作为 artifact，以校验和或
URI 引用。已提交的运行记录还必须包含按校验和寻址的 `run_manifest` 引用。

## 测试分类

| 类型 | 位置 | Git 策略 | Benchmark 用途 |
| --- | --- | --- | --- |
| 一次性探针 | `scratch/` | 忽略 | 不得支撑结论 |
| 候选测试 | `incubator/` | 提交 | 仅用于评审/pilot |
| 正式任务 | `suites/<suite>/tasks/<slug>/vN/` | 提交并带 snapshot | 由生命周期阶段决定是否可用 |
| 退休任务 | 原正式路径，阶段为 `retired` | 提交并带 snapshot | 仅显式重放 |
| 运行产物 | 外部存储或被忽略的 `artifacts/` | Git 保存校验和/URI | 为正式记录提供证据 |
