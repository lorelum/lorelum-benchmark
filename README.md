# Lorelum Benchmark

本仓库为可复现的 Agent 编程评测提供通用契约、Pi 执行器和正式记录链路。
G0/G1 的主证据将来自真实 Next App Router 仓库，而不是单文件微夹具。

## 当前状态

[`incubator/realistic-react-repo/v1`](incubator/realistic-react-repo/v1) 是当前唯一的
React Skill 对比候选基座。它包含冻结的 Next、React、Playwright 依赖，预注册的三份
真实问题 dossier，以及已离线校准的 dashboard 首题。尚未创建正式 task revision、Pi
请求或运行记录，也不会在离线校准前调用模型 API。

`practice-effectiveness` 保持独立的候选轨道，不与 React Skill 对比共享结论。

## 目录结构

- `incubator/realistic-react-repo/`：真实仓库候选、public starter 与 private evaluator。
- `suites/`：未来冻结后的正式任务 revision。
- `schemas/`：机器可读契约。
- `src/benchmark/`：Bun/TypeScript 校验器、evaluator 和 Pi v2 adapter。
- `treatments/`、`environments/`：固定 Skill、运行环境与隔离策略。
- `results/records/`：正式不可变运行记录；当前没有正式结果。

## 校验

```sh
bun run validate
bun run test:contracts
bun run test:realistic-repo
```

真实仓库的候选路径、私有边界和离线校准规则见
[`incubator/realistic-react-repo/v1/benchmark.yaml`](incubator/realistic-react-repo/v1/benchmark.yaml)。

## Pi 自动化

Pi v2 仍负责 public-only workspace、treatment 交付、trace 审计和正式记录。真实任务
冻结为 `suites/` revision 后才会生成 G0/G1 请求。运行约束见
[`docs/PI_RUNNER.md`](docs/PI_RUNNER.md)。
