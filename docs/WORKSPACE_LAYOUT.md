# Benchmark 工作区布局

```text
protocol/                     实验设计、对比和发布规则
docs/                         维护者指南和生命周期文档
schemas/                      机器可读的共享契约
src/benchmark/                runner、adapter、evaluator、指标和报告
cases/                        升级到 suite 前的可复用任务素材
treatments/                   版本化 benchmark 条件
environments/                 版本化 runtime 与依赖固定信息
incubator/                    已提交的候选测试，不属于默认 suite
suites/<suite>/
  suite.yaml                  suite 元数据和任务目录
  manifests/                  suite 级覆盖度和映射
  tasks/<task-slug>/v<version>/
    public/                   task.yaml、task.md、starter/
    private/                  evaluator/、oracle.yaml、snapshot.json
results/records/              不可变且已提交的正式运行元数据
releases/                     已发布的 manifest、摘要和报告
artifacts/                    被忽略的日志、patch、trace 和工作区
scratch/                      被忽略的一次性探针和实验
```

包括退休版本在内的所有正式版本都保留在 `suites/` 下。suite manifest 控制默认参与的
版本；退休版本仍可通过显式任务引用运行。

`public/` 保存公开任务夹具，但不一定涵盖每个条件下 Agent 可见的全部输入。每个条件都使用
全新的工作区，并以 `public/task.md` 与 `public/starter/` 作为任务起始内容。若条件声明了版本化
`treatment`，可按 [`treatments/README.md`](../treatments/README.md) 中的 condition-scoped contract
另外交付：`practice-card` 只能经运行时通道注入；`project-convention/v1` 只能在声明该 treatment
的条件中物化。评测器、oracle 和评分材料绝不能进入 Agent 工作区或模型输入；仅供评测使用的私有
材料只能在 Agent 运行结束后提供给 evaluator。

`incubator/` 是可长期维护的候选区。`scratch/` 和 `artifacts/` 可丢弃且被忽略。候选
只有升级为版本化 suite 任务后才成为正式任务。支持运行记录的 artifact 必须以校验和或
URI 引用。依赖 manifest 和 lockfile 是源码；已安装依赖是生成产物。
