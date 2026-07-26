# Benchmark 协议

本仓库为固定 Vercel React Skill 的性能对比维护可复现的编程任务：

| 轨道 | 问题 | 必需条件 |
| --- | --- | --- |
| `performance-skill-comparison` | 固定 Vercel React Skill 能否改善真实 Next 仓库问题的解决质量？ | 基线、Vercel Skill |

任务卡、评测器、运行记录和评审流程共同保证对比只改变预先声明的实验条件。

## 实验条件

- `baseline` (`G0`)：不注入外部 Skill。
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
绝不能复制 `private/` 或 `oracle.yaml`。任务题面必须描述目标产品行为，不得泄露私有验收材料。

Practice-injection 候选还需遵循 [Practice Benchmark 维护者指南](./PRACTICE_BENCHMARK_GUIDE.md)：区分公开任务、注入 Practice、私有语义验收、私有质量信号和实现偏好，禁止把 reference 偏好伪装成任务失败。

## 数据集扩展

性能轨道在真实 Next App Router 候选仓库中预注册多个端到端问题；每题必须具备公开 issue、私有 reference/naive/mutation 校准、稳定浏览器评估和 rule-behavior 映射后，才能冻结为正式 revision。

修改 prompt、starter 代码、evaluator、Oracle 映射、treatment 或模型设置时，应视情况
创建新的任务、treatment、环境、scorer 或 suite 版本。既有运行记录不可修改。每个任务
还固定 `evaluator_version`；共享 evaluator helper 的行为变化必须创建新的版本目录。
产生正式结果的版本必须保留在原 suite 路径，只从默认活动集合中移除，仍可被显式运行；
未产生正式结果且被明确废弃的候选机制可以从仓库删除。

## 运行记录

每个 JSON 对象代表一次任务执行。正式运行还必须有受
`schemas/run-manifest.schema.json` 约束的不可变 manifest。运行记录和 manifest 共同
固定 suite/case 版本、treatment、scorer、Agent、模型、系统 prompt、工具权限、环境、
源码 commit、实验配对 seed、预算、输入 hash、snapshot id、成本/延迟、代码 diff 位置、自动
检查和盲审结果。

实验配对 seed 用于稳定请求和配对设计，不得自动记为模型采样参数。只有 provider 明确
支持且 adapter 确实传递该参数时，run record 才能在 `model.parameters` 中声明模型 seed。
不支持 seed 的模型必须依靠固定采样参数和多次重复估计结果分布。

每份不可变记录存放于
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
