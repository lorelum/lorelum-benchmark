# 贡献 Benchmark 任务夹具

## 开始前：仓库级流程

开始任务夹具工作前，先按根 [`AGENTS.md`](AGENTS.md) 判断本次变更适用的 Issue、OpenSpec、PR 和
Plan 前置流程，并用 [`docs/README.md`](docs/README.md) 选择适用的维护指南。本指南以下步骤只描述
通过相应门禁后的夹具实施，不替代这些流程。不改变 benchmark 契约的流程或文档修复，按
`AGENTS.md` 的直接 PR 规则处理。

## 新增任务版本

1. 创建 `suites/<suite>/tasks/<task-slug>/v<version>/`。
2. 将题面、元数据和 starter 仓库放入 `public/`。
3. 将 evaluator 和 `oracle.yaml` 放入 `private/`。
4. 在 suite manifest 中登记该版本，然后运行 `bun run validate`，并通过
   `bun run evaluate -- <suite> <task-slug>/v<version>` 运行评测器。
5. 仅在任务版本冻结后添加运行记录。

对于大规模探索批次，在选定前将可长期维护的候选提交到 `incubator/`。被忽略的
`scratch/` 只可存放可丢弃的一次性探针；它们不能支撑 benchmark 结论。

## 冻结与修订

任务一旦已有运行记录，其题面、starter、evaluator、oracle 映射、运行环境和固定的
evaluator 版本均不可修改。正确性变更必须创建 `v<version + 1>` 并新增 suite
manifest 条目。退休版本应在 suite manifest 中标记，同时在原路径保留已提交源码和
快照，以便显式复测。详见 `docs/TASK_LIFECYCLE.md`。

## 结果与产物

将小型、非敏感的运行记录提交到 `results/records/`，每个 `run_id` 对应一个 JSON
文件。日志、patch 和复制的工作区应存放在 `artifacts/` 或外部存储，并在运行记录中
引用其校验和或 URI。正式运行还必须具备
`schemas/run-manifest.schema.json` 所描述的不可变 manifest。上述生成文件不得提交。
