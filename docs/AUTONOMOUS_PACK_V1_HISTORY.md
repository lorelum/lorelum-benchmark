# 自主 Pack：历史 v1 pilot 操作

本文保留 v1 退款候选和 runner 的操作记录，供理解或复现历史 pilot；新任务请使用 [v2 指南](AUTONOMOUS_PACK_BENCHMARK.md)。v1 退款 evaluator 曾出现并发假阳性，相关风险尚未解决，不应把历史校准或 pilot 视为该风险已修复。

共用的基础镜像、Pack 快照和索引准备步骤见 [v2 指南的运行环境与 Pack](AUTONOMOUS_PACK_BENCHMARK.md#运行环境和-pack)；本页以下命令是 v1 专用入口，不是新任务的默认流程。

## 运行配对 pilot

此入口支持真实 HTTPS 模型供应商和本机合成 HTTPS 服务，只接受 `run_kind: "pilot"`，不创建正式 record。模型地址和 key 从进程环境读取，不得写入配置文件；先取得真实模型运行授权。两组使用同一模型、工具、提示、时间和轮次预算，按计划执行并分别保存受控轨迹及私有语义评估。

先按共用准备步骤分别生成两份 `index.tar` 和 `metadata.json`。再准备不含凭据的执行 profile JSON；各 `*_sha256` 均为小写 64 位十六进制，不含 `sha256:` 前缀：

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

准备 model parameters JSON，例如 `{"api_model_id":"deepseek-v4.1-flash","context_window":1000000,"max_tokens":384000}`，以及工具策略 JSON 数组 `["read","bash","edit","write","grep","find","ls","lore_query","lore_get"]`。示例使用该模型在固定 Pi 镜像目录中的输出上限，避免人为设定过小的输出限制；其他模型应使用其目录声明的上限，供应商仍可能施加更低限制。计划中的模型身份必须为 `<Pi 内置 provider>/<api_model_id>`；入口从固定镜像内的 Pi 目录加载模型的 reasoning、compat 和 thinking level 映射，并拒绝不存在或超过目录上限的模型配置。`max_tokens` 是单次模型输出配置，不是总 token 或费用上限。准备两组相同的通用 system prompt。按 [plan schema](../schemas/autonomous-pack-plan-v1.schema.json) 构造 `run_kind: "pilot"` 的计划；`pack.index_sha256` 是安装组归档摘要，`common.profile_sha256` 是上述 profile 文件的字节摘要，`common.image_sha256` 是 Agent 镜像 ID。

下面的完整配置示例会自动从 `LORELUM_PI_BASE_URL` 计算 `common.model_endpoint_sha256`，不需要手动计算或复制。只有自行构造计划时才需要下面的命令；不要将地址中的凭据、API key 或原始地址写进计划。执行时会核对端点身份，旧 pilot 计划仍可读取，但不能直接作为新运行的计划。

```sh
bun --no-env-file -e 'import {modelEndpointSha256} from "./src/benchmark/autonomous-pack/v1/plan"; console.log(modelEndpointSha256(process.env.LORELUM_PI_BASE_URL));'
```

完整配置示例也会自动计算任务身份。自行构造计划时，`source_sha256` 和 `evaluator_sha256` 使用 `sha256SnapshotDirectory`；`input_sha256` 是 `hashContract({task_sha256, starter_sha256})`，普通文件摘要使用 `sha256File`。不要用仓库历史 `sha256Directory` 代替完整树摘要。以下命令仅供手动生成身份，变量指向绝对路径：

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

### 完整配置示例

在仓库根目录、完成上面的 Pack 快照与两组索引准备后，设置以下环境变量。路径均用绝对路径；Windows 的 Bun 使用 `E:/...` 形式的本机路径，而不是 Git Bash 的 `/e/...` 形式。`PREP_DIR` 的父目录必须存在，但 `PREP_DIR` 本身必须不存在，且不能位于任何输入目录内。`AGENT_IMAGE` 和 `PROXY_IMAGE` 使用 `docker image inspect --format '{{.Id}}'` 返回的完整 ID。地址和 key 由操作者安全地放入环境，不写进下列文件。

```sh
export CANDIDATE="/absolute/path/to/lorelum-benchmark/incubator/autonomous-pack/order-refunds-v2"
export PACK_SNAPSHOT="/absolute/path/to/frozen-pack"
export MODEL_FILE="/absolute/path/to/model.gguf"
export EMPTY_DIR="/absolute/path/to/empty-index"
export INSTALLED_DIR="/absolute/path/to/installed-index"
export PREP_DIR="/absolute/path/to/new-pilot-directory"
export AGENT_IMAGE="sha256:<agent-image-id>"
export PROXY_IMAGE="sha256:<proxy-image-id>"
export PILOT_ID="refund-comparison-001"
# 另行安全设置 LORELUM_PI_BASE_URL 和 LORELUM_PI_API_KEY。
```

以下命令生成两个条件共用的计划与配置，不调用模型。示例固定 `opencode-go/deepseek-v4.1-flash`，每组最多 20 轮、8 分钟；这是单次 pilot，不是统计意义上的充分样本。更换模型时也要同步版本化环境配置及模型参数。

```sh
bun --no-env-file - <<'TS'
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256File } from "./src/benchmark/fs";
import { sha256SnapshotDirectory } from "./src/benchmark/autonomous-pack/v1/snapshot";
import { assertPlan, hashContract, modelEndpointSha256 } from "./src/benchmark/autonomous-pack/v1/plan";

const need = name => { const value = process.env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
const candidate = resolve(need("CANDIDATE")), pack = resolve(need("PACK_SNAPSHOT"));
const empty = resolve(need("EMPTY_DIR")), installed = resolve(need("INSTALLED_DIR"));
const modelFile = resolve(need("MODEL_FILE")), prep = resolve(need("PREP_DIR"));
const image = need("AGENT_IMAGE"), proxyImage = need("PROXY_IMAGE");
if (![image, proxyImage].every(x => /^sha256:[a-f0-9]{64}$/.test(x))) throw new Error("Use complete Docker image IDs");
const environment = resolve("environments/autonomous-pack/v1/environment.yaml");
const emptyMeta = join(empty, "metadata.json"), installedMeta = join(installed, "metadata.json");
const [baseline, treatment] = await Promise.all([emptyMeta, installedMeta].map(async p => JSON.parse(await readFile(p, "utf8"))));
if (baseline.condition !== "empty-store" || treatment.condition !== "pack-installed" || ["pack_sha256", "model_sha256", "profile_id", "encoding_id"].some(k => baseline[k] !== treatment[k])) throw new Error("Index metadata does not match");
if (await sha256SnapshotDirectory(pack) !== treatment.pack_sha256 || await sha256File(modelFile) !== treatment.model_sha256) throw new Error("Pack or embedding model identity mismatch");
await mkdir(prep, { mode: 0o700 });
const profile = join(prep, "profile.json"), modelParams = join(prep, "model.json"), toolPolicy = join(prep, "tools.json"), systemPrompt = join(prep, "system.txt");
const dump = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx", mode: 0o600 });
await dump(profile, { schema_version: "autonomous-pack-execution-profile/v1", profile_id: treatment.profile_id, encoding_id: treatment.encoding_id, model_sha256: treatment.model_sha256, empty_index_sha256: baseline.index_sha256, empty_metadata_sha256: await sha256File(emptyMeta), installed_metadata_sha256: await sha256File(installedMeta), proxy_image_sha256: proxyImage.slice(7) });
await dump(modelParams, { api_model_id: "deepseek-v4.1-flash", context_window: 1000000, max_tokens: 384000 });
await dump(toolPolicy, ["read", "bash", "edit", "write", "grep", "find", "ls", "lore_query", "lore_get"]);
await writeFile(systemPrompt, "You are a coding agent. Complete the user task using the available tools. Lore is an optional knowledge search tool: lore_query returns Practice titles and applicability metadata, while lore_get reads a Practice by ID. Decide independently whether either tool would help.\n", { flag: "wx", mode: 0o600 });
const publicRoot = join(candidate, "public"), evaluatorRoot = join(candidate, "private", "evaluator");
const starterSha = await sha256SnapshotDirectory(join(publicRoot, "starter"));
const taskSha = await sha256File(join(publicRoot, "task.md"));
const plan = { schema_version: "autonomous-pack-plan/v1", id: need("PILOT_ID"), run_kind: "pilot", tasks: [{ id: "candidate", source_sha256: starterSha, input_sha256: hashContract({ task_sha256: taskSha, starter_sha256: starterSha }), evaluator_sha256: await sha256SnapshotDirectory(evaluatorRoot) }], repetitions: 1, order_seed: 8, common: { environment_sha256: await sha256File(environment), image_sha256: image.slice(7), agent: "pi", model: "opencode-go/deepseek-v4.1-flash", model_endpoint_sha256: modelEndpointSha256(need("LORELUM_PI_BASE_URL")), model_parameters_sha256: await sha256File(modelParams), profile_sha256: await sha256File(profile), tool_policy_sha256: await sha256File(toolPolicy), system_prompt_sha256: await sha256File(systemPrompt), budget: { max_turns: 20, max_duration_ms: 480000 } }, pack: { source: "operator-frozen-pack", snapshot_uri: pathToFileURL(pack).href, snapshot_sha256: treatment.pack_sha256, index_sha256: treatment.index_sha256 } };
assertPlan(plan);
const config = { plan, sources: { pack, tasks: { candidate: { publicRoot, evaluatorRoot } }, common: { environment, modelParameters: modelParams, profile, toolPolicy, systemPrompt } }, outputDirectory: join(prep, "output"), modelFile, indexes: { empty: { archive: join(empty, "index.tar"), metadata: emptyMeta }, installed: { archive: join(installed, "index.tar"), metadata: installedMeta } }, auditWaitMs: 30000 };
await dump(join(prep, "pilot.json"), config);
console.log(`Prepared ${join(prep, "pilot.json")}`);
TS
```

确认真实模型运行已获授权后执行：

```sh
bun --no-env-file run src/benchmark/autonomous-pack/v1/paired-runner.ts "$PREP_DIR/pilot.json"
```

先看 `$PREP_DIR/output/summary.json` 中的计划分母、`pairs.eligible` 和 `semantic_comparable`，再看每个 observation 的 `health`、`semantic`、`trace` 与用量。任一运行失败或无法核验时，不把该配对当作有效比较；原始 trace 和私有评价材料只留在受控存储。

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

更新后的 observation 不覆盖原文件。需要汇总时，调用 `summarizePlan(plan, observations)` 并使用更新后的 observation 替换对应 ordinal；不得同时传入同一 ordinal 的原版和更新版。汇总逐次保留各质量维度的状态和分值；`quality: observed` 只表示评审完成，不表示各维度均为正面。

## 检查契约与解释结果

```sh
bun --no-env-file test src/benchmark/autonomous-pack/v1/trace.test.ts src/benchmark/autonomous-pack/v1/snapshot.test.ts src/benchmark/autonomous-pack/v1/plan.test.ts src/benchmark/autonomous-pack/v1/model-proxy.test.ts
bun --no-env-file src/benchmark/validate.ts
bun --no-env-file src/benchmark/snapshot.ts
openspec validate autonomous-pack-benchmark-242 --type change --strict --json
```

`schedulePlan` 生成固定配对次序，`summarizePlan` 将缺失、失败和不可比较的运行保留在计划分母；其输出不是正式 record。完整覆盖时未查询、空结果、查询失败和读取失败是不同状态；trace 截断或无法观测的调用不能判为未查询。shell 可以绕过专用工具调用 Lore，因此出现 shell 调用时检索总体状态保守标为 `indeterminate`；已观察的 query 成功、空结果、失败和不确定次数仍分别记录与汇总，只代表轨迹中可见的调用。旧观测缺少这些计数字段时标为不可得，不当作零。这不单独排除其他条件满足的功能比较。功能是否完成由语义断言决定，架构及可维护性为独立质量证据，不使用隐藏加权总分。

Agent 失败时不执行语义评估，也不纳入有效配对；仍保留已完成的可见 Lore 读取计数，整体检索状态为不可判定。代理独立收尾后，如供应商用量事件完整且终态可核验，失败运行仍报告相应用量；缺失或中断时不估算。

模型代理仅在流式响应的首个事件明确报告 `Concurrency limit exceeded for user, please retry later`、尚未向 Agent 交付响应时做有限退避重试，最多额外三次，每次计入相同的请求预算。其他错误及已开始响应的流不重放；重试耗尽时保留原错误。不完整的供应商用量仍不可用，不能把重试次数误当费用。

代理与计划摘要共用同源上游地址构造；路径开头的 `//` 不会更改配置的主机。首事件解析支持跨 chunk 的 LF、CRLF、CR 及其组合。使用修复后的代理必须重新构建并固定新镜像 ID；旧镜像与 pilot 不会被改写。若旧计划的双斜线路径曾产生错误主机的端点摘要，应新建计划，不能沿用该错误身份。

代理的 `Upstream connection failed` 表示连接上游时发生异常；`Upstream returned HTTP <状态码>` 表示上游已返回该 HTTP 状态。二者都不包含上游响应正文或凭据；旧版本的 `Upstream request failed` 未区分这两种情况，不能据此反推原因。

用户已取消严格总 token 上限；两组仍须使用相同的时间和轮次预算。用量由代理记录，只有每次请求的事件和终态完整一致时才汇总 token；费用目前仅识别供应商响应中明确以美元命名的 `usage.cost_usd` 数值，并且仅在所有请求都有有效费用时汇总。其他字段、币种、缺失或冲突均不推算为美元费用；token 仍可单独可用。**这不提供严格 token 或费用封顶**；真实模型运行、正式记录和提升为 suite revision 仍需各自的生命周期、安全和授权门禁。
