# 自主 Pack 对照：准备、运行与结果解读

本文描述 Issue [#242](https://github.com/lorelum/lorelum-benchmark/issues/242) 的配对 pilot。真实模型执行需要明确授权；pilot 不产生正式 record，不等于正式实验结论。

## 对照与结论边界

两组使用相同 task、starter、系统提示、模型、工具、环境和预算；基线使用空 Lore Store，处理组只多安装固定 Pack。Agent 自行选择是否查询和读取 Practice，不由 benchmark 预先查询或注入。记录功能、质量、检索行为、运行健康与成本时分开报告；一次查询或一个成功题目不证明 Pack 提升了代码质量。

当前首个 Pack 源是本地 `E:/lorelum-packs/packs/agentic-coding` 工作树；它可能包含未提交内容，版本号和 Git commit 不能代替完整内容身份。不要在用户 Pack 仓库中覆盖已安装内容。

## 准备运行时与隔离镜像

工作区依赖的 Bun、Node 和 Pi 版本以及安装步骤见 [environments/README.md](../environments/README.md)。在仓库根目录的支持管道的 shell 中：

```sh
bun install --frozen-lockfile
tar -cf - Dockerfile.autonomous-pack package.json bun.lock environments/autonomous-pack/v1/entrypoint.sh src/benchmark/fs.ts src/benchmark/autonomous-pack/v1/snapshot.ts src/benchmark/autonomous-pack/v1/index-prepare.ts src/benchmark/autonomous-pack/v1/index-archive.ts src/benchmark/autonomous-pack/v1/index-restore.ts src/benchmark/autonomous-pack/v1/agent-bootstrap.ts src/benchmark/autonomous-pack/v1/lore-extension.ts |
  docker build --platform linux/amd64 -f Dockerfile.autonomous-pack -t lorelum-autonomous-pack:v1 -
docker image inspect --format '{{.Id}}' lorelum-autonomous-pack:v1
bun --no-env-file run environments/autonomous-pack/v1/isolation-preflight.ts '<上一条输出的完整镜像ID>'
```

构建使用固定的 Lore 发行包摘要；preflight 检查无网络容器的工具版本、文件和凭据隔离以及独立临时状态。**它不验证模型 API 的代理出站、语义索引或真实 Agent。** 仅凭镜像构建或离线 preflight 不得将运行记为有效对照。

模型代理只转发到配置的 HTTPS 上游和指定模型；Agent 与代理位于不同网络边界，Agent 不接收上游凭据。Docker daemon、镜像、代理和上游供应商必须可信；代理通过标准输入接收凭据，上游若在响应中回显凭据仍可能泄露。

可单独构建代理镜像并运行仅使用合成凭据与本地 HTTPS 服务的双网络预检。它需要 `openssl` 和 Docker；使用两个镜像的完整不可变 ID：

```sh
tar -cf - Dockerfile.autonomous-pack-proxy src/benchmark/autonomous-pack/v1/model-proxy.ts src/benchmark/autonomous-pack/v1/provider-usage.ts |
  docker build --platform linux/amd64 -f Dockerfile.autonomous-pack-proxy -t lorelum-autonomous-pack-proxy:v1 -
docker image inspect --format '{{.Id}}' lorelum-autonomous-pack:v1
docker image inspect --format '{{.Id}}' lorelum-autonomous-pack-proxy:v1
bun --no-env-file run environments/autonomous-pack/v1/egress-preflight.ts '<Agent镜像完整ID>' '<代理镜像完整ID>'
```

该预检检查 Docker 容器、网络成员、镜像与挂载配置，并覆盖有限的本地连接、代理目标和请求数量限制；输出列出未覆盖项。每次释放 Agent 前重新检查该次拓扑；配置观察不能证明完整网络隔离或上游不会回显凭据。代理的请求数量上限与两组的轮次上限相同，不是 token 或费用上限。

Agent 可直接从 shell 使用原生 Lore CLI，也可使用 `lore_query` 和 `lore_get` 工具。普通 Pi 轨迹不能完整覆盖 shell 内的调用；存在可能绕过时，检索状态标为 `indeterminate`，不推断为未查询。轨迹可能包含查询及代码，只能作为受控材料处理。

调用方进程中已存在的环境变量可能优先于仓库 `.env`。真实运行前确认实际生效的 `LORELUM_PI_BASE_URL` 和 `LORELUM_PI_API_KEY` 来自预期配置；不要输出、记录或提交 key。纯离线验证使用 `bun --no-env-file` 并移除相关凭据。

## 冻结 Pack 与公开输入

`src/benchmark/autonomous-pack/v1/snapshot.ts` 的 `snapshotPack(source, destination)` 将源目录复制到不存在的目标目录，拒绝符号链接，并用 `autonomous-pack-tree/v1` 树摘要核验复制前后内容：包含隐藏文件和空目录，不包含跨操作系统不稳定的文件权限。该摘要与仓库其他历史目录摘要算法不同，不能互换；旧算法产生的试验性 Pack 摘要和索引归档需要重新准备。目标应放在隔离的 artifact 存储，不应放进 Agent 任务目录或 Git 提交。保留快照本身、digest、Lore 版本、安装返回的 artifact digest、模型及检索 profile 和索引身份；不同算法的 digest 不应假定相等。

在支持 shell 的环境中，设置 `PACK_SOURCE` 为本地实际工作树、`PACK_SNAPSHOT` 为尚不存在的隔离目标路径，然后运行：

```sh
export PACK_SOURCE PACK_SNAPSHOT
PACK_SHA="$(bun --no-env-file -e 'import {snapshotPack} from "./src/benchmark/autonomous-pack/v1/snapshot"; console.log(await snapshotPack(process.env.PACK_SOURCE, process.env.PACK_SNAPSHOT));')"
export PACK_SHA
```

应检查命令退出状态并持久保存快照和 `PACK_SHA`；不要将两个路径都指向 Pack 工作树，也不要把快照目录放在源目录内部。

每个运行只从 `public/task.md` 与 `public/starter/` 创建干净工作区；`private/` 中的 evaluator、oracle、校准和评分不能进入 Agent 输入。安装 Pack 不等于语义索引就绪：固定 embedding 模型内容及 `encodingId`，并将 `query.retrievalMethod` 配置为与工具使用的 `single-vector` 一致；核验真实 Lore 返回的 index/profile 状态。`index status` 返回 ready 后，实际语义查询仍可能报告 indexing，因此还要检查查询结果的 profile 一致且 coverage 为 complete；`preparing`、`indexing`、失败或部分覆盖不能记为空结果或有效检索。
空 Store 的 `index status` 可以是 `missing`，但实际语义查询仍应成功返回相同 profile、complete coverage 和空结果；不可把它与安装组索引缺失混淆。索引就绪预检应在受控准备阶段进行，不向 Agent 提供检索词、结果或预选 Practice。

离线准备每个条件的 Store 和语义索引时，使用前述镜像的完整 ID、已冻结的 Pack 目录和 embedding 模型目录。`OUT` 必须是新的空目录，Docker 必须能以容器用户 `65532` 写入它。以下变量分别是 `IMAGE`、`PACK_SNAPSHOT`、`MODEL_DIR`、`OUT` 的绝对路径或镜像 ID，以及已核验的 `PACK_SHA`、`MODEL_SHA`、`PROFILE_ID`、`ENCODING_ID`：

```sh
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 256 --memory 3g --workdir /tmp \
  --tmpfs /tmp:rw,nosuid,nodev,size=2g,mode=1777 \
  --mount "type=bind,src=$PACK_SNAPSHOT,dst=/pack,readonly" \
  --mount "type=bind,src=$MODEL_DIR,dst=/model,readonly" \
  --mount "type=bind,src=$OUT,dst=/out" \
  --entrypoint bun "$IMAGE" run /opt/autonomous-pack/src/benchmark/autonomous-pack/v1/index-prepare.ts \
  "$CONDITION" "$PACK_SHA" "$MODEL_SHA" "$PROFILE_ID" "$ENCODING_ID" > "$OUT/metadata.json"
```

分别以 `CONDITION=empty-store` 和 `CONDITION=pack-installed`、不同的空 `OUT` 运行。命令核验 Pack 和模型内容、真实语义查询 coverage、profile、模型编码及停止后的 backend，并将身份 JSON 保存为 `metadata.json`。`OUT/index.tar` 包含完整 Store 和 cache，保留安装 Pack 的相对符号链接；`index_sha256` 是该归档实际字节的 SHA-256，必须与归档及元数据一同保存。只对已验证摘要的归档在新隔离目录中恢复；不要将准备产物挂载到 Agent 公开任务目录。本命令不启动编码 Agent，也不生成 benchmark record。
镜像内 `index-restore.ts` 在启动 Agent 前验证模型和归档摘要、拒绝越界归档路径与不安全链接，然后将 `store` 恢复到 `$HOME/.lorelum`、将 `cache` 恢复到 `$HOME/.lorelum/cache`，并写入相同 embedding 和 `single-vector` 配置。原生 `lore` 默认路径与专用工具显式使用的 Store、cache 因而一致。

## 运行配对 pilot

此入口支持真实 HTTPS 模型供应商和本机合成 HTTPS 服务，只接受 `run_kind: "pilot"`，不创建正式 record。模型地址和 key 从进程环境读取，不得写入配置文件；先取得真实模型运行授权。两组使用同一模型、工具、提示、时间和轮次预算，按计划执行并分别保存受控轨迹及私有语义评估。

先分别准备上面的两份 `index.tar` 和成功退出产生的 `metadata.json`。再准备不含凭据的执行 profile JSON；各 `*_sha256` 均为小写 64 位十六进制，不含 `sha256:` 前缀：

```json
{
  "schema_version": "autonomous-pack-execution-profile/v1",
  "profile_id": "<环境中的 embedding profile_id>",
  "encoding_id": "<环境中的 embedding encoding_id>",
  "model_sha256": "<model.gguf 的 SHA-256>",
  "empty_index_sha256": "<空 Store index.tar 的 SHA-256>",
  "empty_metadata_sha256": "<空 Store metadata.json 的 SHA-256>",
  "installed_metadata_sha256": "<安装组 metadata.json 的 SHA-256>",
  "proxy_image_sha256": "<代理镜像 ID>"
}
```

准备 model parameters JSON，例如 `{"api_model_id":"deepseek-v4.1-flash","context_window":1000000,"max_tokens":8192}`，以及工具策略 JSON 数组 `["read","bash","edit","write","grep","find","ls","lore_query","lore_get"]`。计划中的模型身份必须为 `<Pi 内置 provider>/<api_model_id>`；入口从固定镜像内的 Pi 目录加载模型的 reasoning、compat 和 thinking level 映射，并拒绝不存在或超过目录上限的模型配置。`max_tokens` 是单次模型输出配置，不是总 token 或费用上限。准备两组相同的通用 system prompt。按 [plan schema](../schemas/autonomous-pack-plan-v1.schema.json) 构造 `run_kind: "pilot"` 的计划；`pack.index_sha256` 是安装组归档摘要，`common.profile_sha256` 是上述 profile 文件的字节摘要，`common.image_sha256` 是 Agent 镜像 ID。

任务的 `source_sha256` 和 `evaluator_sha256` 使用 `sha256SnapshotDirectory`；`input_sha256` 是 `hashContract({task_sha256, starter_sha256})`，其中 task 摘要与其余普通文件摘要使用 `sha256File`。不要用仓库历史 `sha256Directory` 代替完整树摘要。以下命令可输出一个候选所需的三个任务身份；变量指向绝对路径：

```sh
bun --no-env-file -e '
import {sha256SnapshotDirectory} from "./src/benchmark/autonomous-pack/v1/snapshot";
import {sha256File} from "./src/benchmark/fs";
import {hashContract} from "./src/benchmark/autonomous-pack/v1/plan";
const starter = await sha256SnapshotDirectory(process.env.STARTER);
const task = await sha256File(process.env.TASK);
console.log(JSON.stringify({source_sha256:starter,input_sha256:hashContract({task_sha256:task,starter_sha256:starter}),evaluator_sha256:await sha256SnapshotDirectory(process.env.EVALUATOR)}));
'
```

pilot 配置文件是本机受控 JSON，包含 `plan`、`sources`、`outputDirectory`、`modelFile`、`indexes`、`auditWaitMs`，不能包含上游地址或凭据。`sources` 的结构为：

```json
{
  "pack": "<冻结 Pack 目录>",
  "tasks": {"<计划中的任务 ID>": {"publicRoot": "<任务 public 目录>", "evaluatorRoot": "<私有 evaluator 目录>"}},
  "common": {
    "environment": "<environments/autonomous-pack/v1/environment.yaml>",
    "modelParameters": "<model parameters JSON>",
    "profile": "<执行 profile JSON>",
    "toolPolicy": "<工具策略 JSON>",
    "systemPrompt": "<公开 system prompt>"
  }
}
```

`indexes` 的结构为 `{"empty":{"archive":"<空组 index.tar>","metadata":"<空组 metadata.json>"},"installed":{"archive":"<安装组 index.tar>","metadata":"<安装组 metadata.json>"}}`。所有路径使用绝对路径，`outputDirectory` 必须不存在且不与输入重叠。将已授权供应商地址和 key 分别放在进程环境变量 `LORELUM_PI_BASE_URL` 与 `LORELUM_PI_API_KEY`，然后运行：

```sh
bun --no-env-file run src/benchmark/autonomous-pack/v1/paired-runner.ts /absolute/path/to/pilot.json
```

输出目录含冻结输入、独立工作区、每次运行的 `topology.json`、受控 trace、语义评估、每次 observation 和 `summary.json`；不得提交或分享原始 trace、私有映射与 evaluator。拓扑不符会在释放 Agent 前失败；元数据、归档或模型摘要不符会在模型请求前失败。`observed` 表示在可信 Docker、镜像、代理和上游的前提下观察到预期配置，不是对所有网络行为的证明。`summary.json` 保留计划分母；人工中断可能留下未完成目录。

## 候选任务与离线校准

`incubator/autonomous-pack/order-refunds-v2/` 是多文件退款服务候选，不是冻结的正式 suite 任务；v2 保留 v1 公共题面与 starter，修复私有 evaluator 对同步 API 的漏判。v1 及其 pilot 保留原始评测身份。私有 evaluator 由控制端运行，候选代码在无网络只读容器内通过通用 JSONL bridge 接收请求；私有断言不挂载给候选。先构建上述镜像，再在 PowerShell 中运行：

```powershell
$base = (Resolve-Path 'incubator/autonomous-pack/order-refunds-v2').Path
foreach ($name in 'valid-atomic','valid-queue','defect-idempotency','defect-balance','defect-sync-return','defect-sync-throw') {
  $env:WORKSPACE = Join-Path $base "private/calibration/$name"
  node --test (Join-Path $base 'private/evaluator/semantic.test.mjs')
}
$env:WORKSPACE = Join-Path $base 'public/starter'
node --test (Join-Path $base 'private/evaluator/semantic.test.mjs')
Remove-Item Env:WORKSPACE
```

两种 `valid-*` 应通过，四个 `defect-*` 和未完成 starter 应失败；其中同步返回和同步抛错的缺陷用于检查公开异步 API。非零退出还可能是 Docker 不可用、超时或环境错误，必须检查具体原因，不可一律记为语义失败。任务细节与盲审维度见该候选 `private/README.md`；其内容不得复制给 Agent。

### 条件盲审

语义评估与质量分开。运行结束后，可在控制端使用 `prepareBlindReview` 将两个已停止工作区与同一 starter 的 diff 生成随机 ID 的盲审包。只向评审者提供输出目录下的 `review/`；`private/mapping.json`、原始 trace、条件、evaluator 和评审证据不得提供给 Agent。diff 中的代码或注释仍可能自行泄露条件，随机 ID 不能保证绝对盲法。

设置 `STARTER`、计划中的 `STARTER_SHA`、两次运行各自的 `workspace.json` 路径 `IDENTITY_A` / `IDENTITY_B`、对应 observation 路径 `OBS_A` / `OBS_B`、私有 rubric 路径 `RUBRIC`，以及尚不存在的受控输出目录 `PACKET_DIR`。以下命令核验工作区与 starter 摘要，并生成盲审包：

```sh
bun --no-env-file -e '
import {fileURLToPath} from "node:url";
import {sha256File} from "./src/benchmark/fs";
import {prepareBlindReview} from "./src/benchmark/autonomous-pack/v1/blind-review";
const ids = await Promise.all([process.env.IDENTITY_A,process.env.IDENTITY_B].map(p => Bun.file(p).json()));
const obs = await Promise.all([process.env.OBS_A,process.env.OBS_B].map(p => Bun.file(p).json()));
const items = ids.map((v,i) => ({id:`${obs[i].plan_sha256}:${obs[i].ordinal}`,starter:process.env.STARTER,starterSha256:process.env.STARTER_SHA,workspace:fileURLToPath(v.uri),workspaceSha256:v.sha256}));
await prepareBlindReview({items,rubricFile:process.env.RUBRIC,rubricSha256:await sha256File(process.env.RUBRIC),criteria:["comprehensibility","maintainability","verification-evidence","robustness"],outputDirectory:process.env.PACKET_DIR});
'
```

评审者根据 `review/rubric.md` 和 `review/index.json`，为每个 blind ID 形成 JSON：`{"blind_id":"<ID>","probes":[{"id":"<criterion>","status":"observed|not-observed|indeterminate","evidence":"<具体代码证据或不可判定原因>"}]}`；每个 criterion 恰好一项。控制端借助私有映射选择对应的 `OBSERVATION`，并将 `REVIEW_JSON`、尚不存在的私有证据文件 `PRIVATE_RESULT` 和新 observation 文件 `REVIEWED_OBSERVATION` 设置为绝对路径；二者均须位于 Agent 工作区及评审者的 `review/` 之外。运行：

```sh
bun --no-env-file -e '
import {writeFile} from "node:fs/promises";
import {applyBlindReview} from "./src/benchmark/autonomous-pack/v1/quality-observations";
const result = await applyBlindReview(await Bun.file(process.env.OBSERVATION).json(), process.env.PACKET_DIR, await Bun.file(process.env.REVIEW_JSON).json(), process.env.PRIVATE_RESULT);
await writeFile(process.env.REVIEWED_OBSERVATION, JSON.stringify(result, null, 2), {flag:"wx", mode:0o600});
'
```

收取时会重新核对 rubric、索引和 diff 摘要；变动后不能把该评审归到原运行。`quality: observed` 仅表示所有维度均已评审，不表示质量为正；各维度的 `not-observed` 单独保留，任何 `indeterminate` 令总体质量为不可判定。没有隐藏总分；人工证据是主观观察，不能替代语义断言。

更新后的 observation 不覆盖原文件。需要汇总时，调用 `summarizePlan(plan, observations)` 并使用更新后的 observation 替换对应 ordinal；不得同时传入同一 ordinal 的原版和更新版。

## 检查契约与解释结果

```sh
bun --no-env-file test src/benchmark/autonomous-pack/v1/trace.test.ts src/benchmark/autonomous-pack/v1/snapshot.test.ts src/benchmark/autonomous-pack/v1/plan.test.ts src/benchmark/autonomous-pack/v1/model-proxy.test.ts
bun --no-env-file src/benchmark/validate.ts
bun --no-env-file src/benchmark/snapshot.ts
openspec validate autonomous-pack-benchmark-242 --type change --strict --json
```

`schedulePlan` 生成固定配对次序，`summarizePlan` 将缺失、失败和不可比较的运行保留在计划分母；其输出不是正式 record。完整覆盖时未查询、空结果、查询失败和读取失败是不同状态；trace 截断或无法观测的调用不能判为未查询。shell 可以绕过专用工具调用 Lore，因此出现 shell 调用时检索总体状态保守标为 `indeterminate`；这不单独排除其他条件满足的功能比较。功能是否完成由语义断言决定，架构及可维护性为独立质量证据，不使用隐藏加权总分。

用户已取消严格总 token 上限；两组仍须使用相同的时间和轮次预算。用量由代理记录，只有每次请求的事件和终态完整一致时才汇总 token；费用目前仅识别供应商响应中明确以美元命名的 `usage.cost_usd` 数值，并且仅在所有请求都有有效费用时汇总。其他字段、币种、缺失或冲突均不推算为美元费用；token 仍可单独可用。**这不提供严格 token 或费用封顶**；真实模型运行、正式记录和提升为 suite revision 仍需各自的生命周期、安全和授权门禁。
