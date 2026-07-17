# 贡献 Benchmark 任务夹具

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
