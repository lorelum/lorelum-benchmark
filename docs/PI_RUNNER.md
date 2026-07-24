# Pi Runner 契约

Pi 是用于执行 benchmark 任务的自动化 runner。默认 adapter 为 `pi/v2`：它接收版本化
JSON 请求，但不接受用户提供的工作目录。adapter 会核对 suite、task card、正式 snapshot、
treatment manifest 和 environment manifest，随后在 `.run-workspaces/<run-id>/` 创建全新的
工作区。

工作区只包含 `public/task.md` 和 `public/starter/`；`private/`、evaluator、oracle 与
snapshot 永远不会复制给 Pi。请求中的 Pi 命令和参数仍保持显式，但命令必须与 environment
manifest 中固定的 agent runtime command 一致。`skill` treatment 的固定 `SKILL.md` 会在
hash 校验后作为 Pi `--skill` 参数注入；baseline 不注入任何 Skill。adapter 约束命令的工作目录；正式环境还
必须由 environment manifest 指定的 sandbox 阻止 Pi 逃逸到宿主文件系统。

```sh
# 仅在真实仓库任务被冻结为正式 revision 后使用已提交的实验计划。
bun run pi:requests -- experiments/<suite>/<frozen-plan>.yaml --smoke --output scratch/requests
bun run pi:coordinate -- scratch/requests/<run-id>.json --dry-run
bun run pi:coordinate -- scratch/requests/<run-id>.json
```

当前不存在 active G0/G1 计划或正式 record。React Skill 对比的三个 pilot revision
已在 `suites/realistic-react-skill-comparison` 冻结；在新的实验计划、离线校准与运行
前置条件全部通过前，不得生成 Pi 请求或调用模型 API。

`--dry-run` 会验证全部契约并输出将要使用的隔离工作区，不创建目录也不执行 Pi。正式运行
会在 `artifacts/runs/<run-id>/<manifest_name>` 写入 `pi-run-artifact/v2` manifest，记录经过
核验的输入、实际工作区、公开文件 hash、命令、状态和退出码。大体积 trace、输出与 diff
应从该目录上传到 artifact storage；仓库只提交其索引和校验和。

新任务可在 task card 声明 `evaluator_contract: structured/v2`。其私有
`evaluator/evaluate.ts` 必须导出 `evaluateCandidate({ candidatePath })`，并返回
`evaluator-result/v2`：语义检查全部通过后才运行命名质量探针；探针最大分总计 `100`，语义
失败时强制返回空 probe 和 `0` 分。`bun run evaluate` 在语义通过时退出 `0`，即使质量分未满；
Pi record 会保存完整 evaluator result 与 `quality_score`，供后续质量调整分析。未声明该字段的
历史任务继续使用 Bun test evaluator。

`pi:requests` 会将 experiment ID、计划 hash 和 `smoke`/`pilot`/`official` run kind 写入请求，并按实验计划中的 task、condition 与重复次数生成稳定 run ID。`pilot` 记录只用于验证注入、方差和 evaluator 链路，永不进入正式比较或发布结论；`pi:coordinate`
先执行 adapter preflight，再运行 Pi、以 `CANDIDATE_PATH` 桥接私有 evaluator，并捕获 Pi
输出、evaluator 输出、候选 diff 与 adapter manifest。它会写入
`artifacts/runs/<run-id>/formal-run-manifest.json` 和
`results/records/<suite>/<task>/<run-id>.json`；record 显式保存 Pi v2、treatment、environment、
模型版本、任务与 snapshot 版本，故可独立解释一次结果。正式 environment 只接受提供商的不可变模型快照 ID；`pending-provider-snapshot` 只能用于 dry-run。
请求中的 `execution.seed` 仅用于实验配对，不会伪装成 DeepSeek 模型参数；当前 DeepSeek
Chat API 不支持 seed，因此 smoke 只能用于链路验收，正式比较必须依赖计划中的重复运行。

`vercel-skill/v2` 不在仓库提交 Vercel vendor 文本。adapter 以 manifest 固定的仓库、commit、子路径与目录 hash，在真实 G1 运行前通过 sparse checkout 取得官方 `SKILL.md` 与 `rules/`，并缓存在 `.lorelum-cache/treatments/<bundle-hash>/`。缓存命中时不访问网络；缓存缺失时下载失败或目录 hash 不匹配即 fail closed。每次运行将原生目录复制至 artifact staging，以 `--skill <staging>/SKILL.md` 注册并用 `/skill:vercel-react-best-practices` 显式加载官方索引；模型可按相对路径读取所需 rule。不会缓存、注入或提交编译版 `AGENTS.md`；G0 不获取也不挂载此目录。

每个活跃 `direct` 任务必须在 `private/rule-audit.yaml` 预注册其 G1 必读的规则。该映射不进入 agent workspace，其 hash、目标 treatment 和规则列表会写入 Pi artifact manifest。协调器仅接受在首次 `edit` 或 `write` 前、由成功且未分页的 `read` 调用完整读取的规则；缺失、部分读取、读取失败或编辑后补读都会使 G1 运行无效。G0 访问任一规则同样无效。`control` 与 `partial` 任务不强制读取无关规则。最终 run manifest 会保存 mapping hash、命中规则、读取事件顺序和审计结论；私有 evaluator 再验证这些规则对应的行为。

正式运行要求 `LORELUM_ARTIFACT_STORAGE_URI` 与 environment 中的 S3 URI 完全一致。coordinator 会先将输出、评测日志、diff、环境与 Pi manifest 上传到启用 Object Lock 的版本化 S3 对象，再写入引用带 `versionId` URI 的 run manifest 和 record；任一上传或锁定验证失败都不会创建 record。

`formal-g0-g1` 的真实 smoke job 只能调度到带 `lorelum-formal-sandbox` 标签的 Linux 自托管 GitHub Actions runner。Pi 在 digest 固定的 Docker image 中运行：容器只获得 public workspace 的可写挂载；G1 额外获得校验后 Skill 的只读挂载；宿主 checkout、`.git`、private、AWS 凭据与 GitHub token 均不进入容器。容器使用只读根文件系统、无 capabilities、`no-new-privileges`、PID/内存限制。

runner 必须创建内部网络 `lorelum-formal-egress`。Pi 只连接此网络；allowlist proxy 同时连接该内部网络和上游网络，并仅允许 `api.deepseek.com:443` 的 CONNECT 请求。Pi `0.80.10` 读取 `HTTP_PROXY`/`HTTPS_PROXY`，adapter 只向容器传递该 proxy 和 `DEEPSEEK_API_KEY`。`bun run test:sandbox` 会验证 image digest、版本、挂载、凭据不可见、非允许出口不可达及 DeepSeek 端点经 proxy 可达；未通过时 workflow 不会运行 Pi 或写 record。

`pi/v1` 保留为历史兼容入口：`bun run pi:v1 -- <request> [--dry-run]`。新运行不得使用它。
