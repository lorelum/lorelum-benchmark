# 探索性 Practice 验证

`protocol/practice-effectiveness-exploratory/v1/plan.yaml` 固定 Issue #59 已授权的探索范围：六张
`candidate/pre-incubator` 卡、`baseline` / `oracle-practice` / `irrelevant-practice` 三个条件、每条件两次，合计 36 次。
它不定义正式 experiment plan，不包含 `lorelum-retrieval`，也不创建 treatment 副本；每个注入内容由该 candidate 的 private validation profile `v1` 引用并以内容 hash 校验。

先运行不调用模型、不写 scratch 的配置检查：

```sh
bun run exploratory:practice -- preflight
```

真实执行必须在已部署的 formal Docker sandbox 中完成，并要求 `LORELUM_SANDBOX_ENFORCED=1`、
`lorelum-formal-egress` allowlist proxy、固定镜像和可用 DeepSeek 凭据。凭据优先从 protected runner
环境的 `DEEPSEEK_API_KEY` 获取；本地 Pi 已登录时，可显式指定其 `auth.json`，执行器只读取
`deepseek.key` 并仅传入容器环境，不输出或写入它：

```sh
export LORELUM_SANDBOX_ENFORCED=1
bun run exploratory:practice -- execute --auth-file "$HOME/.pi/agent/auth.json"
```

每次尝试使用一个全新的 scratch workspace，Pi 只看到 `public/task.md`、`public/starter/` 与被显式
挂载的只读 treatment。private evaluator 在 Pi 退出后才以 `CANDIDATE_PATH` 运行。模型输出、diff、
UTC 时间、hash、预算及 evaluator outcome 只会写至被忽略的
`scratch/practice-effectiveness-exploratory/<session>/`，从不写入 `artifacts/`、checksum manifest、
`results/records/` 或提交物。

这只产生方向性探索信号，不能支持 Lorelum 产品整体有效、Practice 已被证明有效、可复现效果、
candidate 升级或正式 benchmark 结论。正式四条件矩阵仍分别受 provider immutable snapshot、版本化
retrieval adapter/pinned output，以及独立 candidate 升级决定阻塞。

经明确授权后，可用 `--mode local-direct` 在本地构建 Pi `0.80.10` Docker 镜像并直连 DeepSeek API。该模式仍只挂载 public workspace 和只读 treatment，但不具备 allowlist egress、固定 registry image 或 protected runner；其 scratch record 会明确标记该非正式网络边界：

```sh
bun run exploratory:practice -- execute --mode local-direct --auth-file "$HOME/.pi/agent/auth.json"
```

若一个 scratch-only 尝试因本机 Docker 或进程中断而未完成，可用其已计划的 run ID 精确重试，避免重跑
其他条件；该诊断尝试仍留在被忽略的 scratch 目录，不能计入 36 次有效尝试：

```sh
bun run exploratory:practice -- execute --mode local-direct --auth-file "$HOME/.pi/agent/auth.json" \
  --run-id pe-webhook-raw-body-verification-irrelevant-practice-02
```

每个新 scratch record 会写入本地执行模式、非正式直连网络边界和本地镜像标识；这些信息只用于
运行配置审计，不会成为正式 artifact manifest 或 benchmark record。
