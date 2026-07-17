# Lorelum Benchmark

本仓库为两条互补的评测轨道提供可复现的任务夹具：

- Practice 有效性：基线、Oracle Practice、Lorelum 检索与无关 Practice 对照。
- Performance Skill 对比：基线、Vercel 官方 React Best Practices Skill 与 Lorelum 检索。

通用的任务卡、评测器和运行记录契约见 `docs/BENCHMARK_PROTOCOL.md`。

## 目录结构

- `suites/`：按 suite 组织的版本化 benchmark 任务夹具。
- `schemas/`：仅存放机器可读的契约。
- `src/benchmark/`：基于 Bun/TypeScript 的 runner、校验器和 Pi adapter 入口。
- `incubator/`：已提交的候选测试；`scratch/`：被忽略的一次性探针。
- `results/records/` 与 `releases/`：不可变运行元数据和已发布摘要；生成产物不纳入版本控制。

每个任务版本都将 Agent 可见的 `public/` 输入与仅供评测器使用的
`private/` 资产隔离。新增或修订任务夹具前，请阅读
`docs/WORKSPACE_LAYOUT.md` 和 `CONTRIBUTING.md`。

历史版本始终保留在仓库中，并可通过显式任务引用复测；suite manifest
控制默认参与的任务集合。候选测试在升级前存放于 `incubator/`；仅可丢弃的
探针才放入被忽略的 `scratch/`。

首批 smoke 夹具为 `async-dashboard-v1` 和 `bundle-advanced-panel-v1`。
区分度任务集还覆盖嵌套异步数据加载、延迟命令、稳定列表操作、隐藏对话框渲染、
客户端监听器清理和单请求服务端去重。评测器与任务素材分离，因此同一任务可在
每个条件下运行。

## 校验工作区

需要 Bun 1.1 或更高版本：

```sh
bun run validate
```

## 运行评测器

starter 预期会在并发断言中失败。请通过统一入口运行：

```sh
bun run evaluate -- react-skill-comparison async-dashboard/v1
```

通过 `CANDIDATE_PATH` 提供候选解源码路径后，即可评测候选解：

```powershell
$env:CANDIDATE_PATH = 'D:\path\to\candidate\src\dashboard.ts'
bun run evaluate -- react-skill-comparison async-dashboard/v1
```

对于条件加载的 bundle evaluator，传入候选 `src/settings.ts` 路径：

```powershell
$env:CANDIDATE_PATH = 'D:\path\to\candidate\src\settings.ts'
bun run evaluate -- react-skill-comparison bundle-advanced-panel/v1
```

每次评测都会在执行测试前校验任务已提交的 `private/snapshot.json`。要复现
历史结果，请检出记录的 `source_commit` 并运行同一任务引用；快照校验会拒绝
被修改的任务数据或 evaluator 文件。

区分度任务到规则的映射记录于
`suites/react-skill-comparison/manifests/coverage.yaml`。该映射目前有意保持
部分覆盖：在固定外部 Skill 的全部规则都有对应任务前，不得据此声称完整覆盖。

## Pi 自动化

Pi 是执行 benchmark 任务的自动化 runner。本仓库不假定 Pi 的命令行形态：
版本化 adapter 接收显式 run request，校验复现所需的固定信息后，执行请求中
提供的 Pi 命令。详见 `docs/PI_RUNNER.md`。
