# Lorelum Benchmark

本仓库为可复现的 Agent 编程评测提供通用契约、Pi 执行器和正式记录链路。
G0/G1 的主证据将来自真实 Next App Router 仓库，而不是单文件微夹具。

## 当前状态

[`realistic-react-skill-comparison`](suites/realistic-react-skill-comparison) 是当前的
React Skill 对比 suite。当前默认集包含三个冻结依赖的多文件 Next App Router pilot revision：
`workspace-dashboard-rsc-v2`、`team-directory-rsc-payload-v3` 和
`workspace-invitation-reconciliation-v2`。没有正式 Pi 请求或运行记录；已被后续 revision 取代的
候选仍保留在原路径，并标记为 `retired`。

`practice-effectiveness` 保持独立的候选轨道，不与 React Skill 对比共享结论。

## 目录结构

- `suites/`：冻结的正式任务 revision 与私有 evaluator。
- `incubator/`：尚未冻结的候选任务，当前主要用于 Practice effectiveness 轨道。
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

真实仓库任务的候选路径、私有边界和离线校准由
[`suites/realistic-react-skill-comparison`](suites/realistic-react-skill-comparison) 中的
task card、snapshot 和 `bun run test:realistic-repo` 共同定义。

## Pi 自动化

Pi v2 仍负责 public-only workspace、treatment 交付、trace 审计和正式记录。真实任务
冻结为 `suites/` revision 后才会生成 G0/G1 请求。运行约束见
[`docs/PI_RUNNER.md`](docs/PI_RUNNER.md)。
