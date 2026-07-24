# Pi Runner 契约

Pi 是用于执行 benchmark 任务的自动化 runner。默认 adapter 为 `pi/v2`：它接收版本化
JSON 请求，但不接受用户提供的工作目录。adapter 会核对 suite、task card、正式 snapshot、
treatment manifest 和 environment manifest，随后在 `.run-workspaces/<run-id>/` 创建全新的
工作区。

工作区只包含 `public/task.md` 和 `public/starter/`；`private/`、evaluator、oracle 与
snapshot 永远不会复制给 Pi。请求中的 Pi 命令和参数仍保持显式，但命令必须与 environment
manifest 中固定的 agent runtime command 一致。`vercel-skill/v2` 通过仓库、commit、子路径和目录 hash
固定原生 `SKILL.md` 与 `rules/`；adapter 在宿主侧校验并缓存 bundle，再作为只读 Pi Skill 注入。
baseline 不下载或挂载 Skill。adapter 约束命令的工作目录；正式环境还
必须由 environment manifest 指定的 sandbox 阻止 Pi 逃逸到宿主文件系统。

```sh
bun run pi:requests -- experiments/react-skill-comparison/g0-g1-smoke-v1.yaml --smoke --output scratch/requests
bun run pi:coordinate -- scratch/requests/<run-id>.json --dry-run
bun run pi:coordinate -- scratch/requests/<run-id>.json
```

`--dry-run` 会验证全部契约并输出将要使用的隔离工作区，不创建目录也不执行 Pi。正式运行
会在 `artifacts/runs/<run-id>/<manifest_name>` 写入 `pi-run-artifact/v2` manifest，记录经过
核验的输入、实际工作区、公开文件 hash、命令、状态和退出码。大体积 trace、输出与 diff
应从该目录上传到 artifact storage；仓库只提交其索引和校验和。

`pi:requests` 会将 experiment ID、计划 hash 和 `smoke`/`pilot`/`official` run kind 写入请求，并按实验计划中的 task、condition 与重复次数生成稳定 run ID。retired 计划不能生成新请求；pilot 至少重复两次，只用于校准而不进入正式结论。`pi:coordinate`
先执行 adapter preflight，再运行 Pi、以 `CANDIDATE_PATH` 桥接私有 evaluator，并捕获 Pi
输出、evaluator 输出、候选 diff 与 adapter manifest。它会写入
`artifacts/runs/<run-id>/formal-run-manifest.json` 和
`results/records/<suite>/<task>/<run-id>.json`；record 显式保存 Pi v2、treatment、environment、
模型版本、任务与 snapshot 版本，故可独立解释一次结果。正式 environment 只接受提供商的不可变模型快照 ID；`pending-provider-snapshot` 只能用于 dry-run。

显式声明 `skill_context` 的 direct 任务必须同时提供私有 `rule-audit.yaml`。公开声明决定最多三条
agent 可见规则，私有审计只用于验证规则和行为映射。Pi 以 JSON event stream 运行；runner 要求 G1 在
首次编辑前完整读取全部声明规则，拒绝分页、失败、编辑后补读和 G0 规则访问，并把 trace 审计写入 artifact
manifest、run manifest 与 record。

本地诊断使用单独标记的容器环境，不复用正式 runner 身份或不可变记录路径。先构建本地镜像并运行
`LORELUM_LOCAL_EXPERIMENT=1 bun run test:local-sandbox`，再以
`LORELUM_LOCAL_EXPERIMENT=1 bun run pi:diagnose -- <plan> --output scratch/<run>` 执行；结果只写入被忽略的
`scratch/`，不得作为正式实验记录。

正式运行要求 `LORELUM_ARTIFACT_STORAGE_URI` 与 environment 中的 S3 URI 完全一致。coordinator 会先将输出、评测日志、diff、环境与 Pi manifest 上传到启用 Object Lock 的版本化 S3 对象，再写入引用带 `versionId` URI 的 run manifest 和 record；任一上传或锁定验证失败都不会创建 record。

`formal-g0-g1` 的真实 smoke job 只能调度到带 `lorelum-formal-sandbox` 标签的 Linux 自托管 GitHub Actions runner。Pi 在 digest 固定的 Docker image 中运行：容器只获得 public workspace 的可写挂载；G1 额外获得校验后 Skill 的只读挂载；宿主 checkout、`.git`、private、AWS 凭据与 GitHub token 均不进入容器。容器使用只读根文件系统、无 capabilities、`no-new-privileges`、PID/内存限制。

runner 必须创建内部网络 `lorelum-formal-egress`。Pi 只连接此网络；allowlist proxy 同时连接该内部网络和上游网络，并仅允许 `api.deepseek.com:443` 的 CONNECT 请求。Pi `0.80.10` 读取 `HTTP_PROXY`/`HTTPS_PROXY`，adapter 只向容器传递该 proxy 和 `DEEPSEEK_API_KEY`。`bun run test:sandbox` 会验证 image digest、版本、挂载、凭据不可见、非允许出口不可达及 DeepSeek 端点经 proxy 可达；未通过时 workflow 不会运行 Pi 或写 record。

`pi/v1` 保留为历史兼容入口：`bun run pi:v1 -- <request> [--dry-run]`。新运行不得使用它。
