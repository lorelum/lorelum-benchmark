# 自主 Pack 对照：准备、运行与结果解读

本文介绍如何设计任务、准备环境并运行自主 Pack 配对 pilot。真实模型执行需要明确授权；pilot 不产生正式 record，不等于正式实验结论。历史退款候选和 v1 runner 请参阅 [v1 操作记录](AUTONOMOUS_PACK_V1_HISTORY.md)。

## 可复用任务框架（v2）

本节面向希望比较其他 Pack、贡献新编码任务或复现实验的使用者。`v2` 将任务输入、任务运行环境、私有 verifier 与配对执行分开；目前真实 Agent adapter 是 Pi 1.5.0，模型必须属于其固定目录中受支持的 `openai-completions` 协议。它不是任意 Agent 或任意模型协议的通用适配器。每个计划使用一个共同的 Agent 镜像；多任务计划的所有任务运行时都要在该镜像及环境声明中提供。

### 制作或选择任务

- **来自真实工作而不是 Practice 改写**：选择 Pack 可能有帮助、但不要求特定 Practice 的维护任务；例如给已有服务增加幂等退款、处理并发和错误边界。
- **留出设计空间**：题目明确外部行为与约束，允许多种合理架构；不要暗示特定文件拆分、模式名称或某条知识的标题。
- **公开输入与私有验收分离**：`public/task.md` 描述用户需求，`public/starter/` 是两组相同的起始代码；私有 evaluator、参考解和质量 rubric 不进入 Agent 工作区或提示。
- **功能与质量分开**：功能用对外可观察行为测试，并用合理实现和缺陷实现校准；可读性、维护性及架构以独立质量证据或匿名盲评报告，不把单一风格当成功能门槛。
- **不要强制检索**：两组公开同样的通用工具说明，不指定 query、不预注入 Practice、不要求 Agent 必须调用 Lore。未查询本身也是观察结果；证据不完整时标记不确定。
- **不要用一题定结论**：实际比较应事先列出多种任务和重复次数，保留失败与缺失运行；一次通过或一次查询不能说明 Pack 整体有效。

参考 [`config-migration-v2`](../incubator/autonomous-pack/config-migration-v2/) 和 [`csv-import-v3`](../incubator/autonomous-pack/csv-import-v3/)。新任务放在 `incubator/autonomous-pack/<id>/`：

- `public/task.md` 和 `public/starter/` 是 Agent 唯一可见的任务材料。
- `private/candidate.yaml` 遵循 [`coding-task/v1`](../schemas/coding-task-v1.schema.json)，绑定公开路径、运行时名称、私有 evaluator 和校准目录；同一计划中的任务 ID 不得重复。
- `private/evaluator/contract.json` 遵循 [`coding-verifier/v1`](../schemas/coding-verifier-v1.schema.json)，声明两个非 shell 命令和超时。每个命令是两个绝对路径：镜像内 runtime 可执行文件，以及分别位于 `/verifier/` 或 `/workspace/` 的入口文件。可添加 evaluator 辅助文件；它们均计入 verifier 摘要。
- `private/calibration/expectations.json` 遵循 [`coding-calibration/v1`](../schemas/coding-calibration-v1.schema.json)，列出合理解、对应功能缺陷和预期。校准是作者诊断，不是每次 pilot 都要重复执行的门槛。

Verifier driver 与候选分别在无网络容器中运行，只有 driver 挂载只读私有 evaluator，只有候选挂载只读工作区；它们通过框架中介 JSON Lines。driver 向 stdout 发送 `{"type":"call","id":"唯一字符串","input":<JSON>}`，候选从 stdin 接收一行 JSON 并输出一行 JSON；driver 从 stdin 收到 `{"type":"reply","id":"同一字符串","output":<JSON>}`。完成至少一次交互后，driver 输出 `{"type":"result","semantic":"pass"}` 或 `"fail"`，然后正常退出；框架关闭候选 stdin 并要求候选正常退出。格式错误、意外退出、超时或容器失败记作未评或不可判定，不伪装成语义不通过。私有测试值会作为输入传给候选；不挂载私有文件不等于消除测试交互侧信道。

框架先创建并确认容器身份，再附着执行；同一 session 等待客户端结束并清理其容器。Docker 创建或清理结果无法确认时，评测保持不可判定，失败原因包含本次容器名称；晚到的守护进程操作可能留下容器，需要在可信 Docker 主机上按这些名称检查清理，不能把一次“容器不存在”当作已证明的清理结果。

任务可以使用其他技术栈：在选定镜像安装对应运行时、在环境 manifest 的 `task_runtimes` 中声明，再提供符合上述协议的入口；不需要改 runner。Docker daemon、宿主、镜像和任务作者的 driver 仍是可信基础，不应运行来源不可信的 verifier。

检查任务声明；环境镜像建好后可执行可选校准（`IMAGE_ID` 是完整 `sha256:...` 镜像 ID，输出目录必须不存在）：

```sh
bun --no-env-file run bench task inspect /absolute/path/to/csv-import-v3
bun --no-env-file run bench task calibrate /absolute/path/to/csv-import-v3 "$IMAGE_ID" /absolute/path/to/new-calibration-output
```

该命令不运行 Agent 或调用模型。`not-run` 与 `fail` 不同：例如 Python 示例的未完成 starter 在协议完成前退出，校准期望其为不可判定；两个具体缺陷解则须被 verifier 判为语义失败。

### 运行环境和 Pack

先构建基础 Agent 与代理镜像，再冻结 Pack 并准备两组索引。`prepare` 会再次复制并核对所给 Pack 的实际完整树，包括未提交改动；两份索引的 Pack、embedding 模型、profile 与 encoding 必须与之匹配。换 Pack 时需要准备匹配的新索引。

#### 构建运行时与隔离镜像

工作区依赖的 Bun、Node 和 Pi 版本以及安装步骤见 [environments/README.md](../environments/README.md)。在仓库根目录的支持管道的 shell 中：

```sh
bun install --frozen-lockfile
tar -cf - Dockerfile.autonomous-pack package.json bun.lock environments/autonomous-pack/v1/entrypoint.sh src/benchmark/fs.ts src/benchmark/autonomous-pack/v1/snapshot.ts src/benchmark/autonomous-pack/v1/index-prepare.ts src/benchmark/autonomous-pack/v1/index-archive.ts src/benchmark/autonomous-pack/v1/index-restore.ts src/benchmark/autonomous-pack/v1/agent-bootstrap.ts src/benchmark/autonomous-pack/v1/lore-extension.ts |
  docker build --platform linux/amd64 -f Dockerfile.autonomous-pack -t lorelum-autonomous-pack:v1 -
docker image inspect --format '{{.Id}}' lorelum-autonomous-pack:v1
```

构建使用固定的 Lore 发行包摘要。无需在每次 pilot 前单独运行离线预检；排查镜像问题时可执行 `bun --no-env-file run environments/autonomous-pack/v1/isolation-preflight.ts '<完整镜像ID>'`。该预检不验证模型 API、语义索引或真实 Agent。

模型代理只转发到配置的 HTTPS 上游和指定模型；Agent 与代理位于不同网络边界，Agent 不接收上游凭据。Docker daemon、镜像、代理和上游供应商必须可信；代理通过标准输入接收凭据，上游若在响应中回显凭据仍可能泄露。

构建模型代理镜像并记录两个镜像的完整不可变 ID：

```sh
tar -cf - Dockerfile.autonomous-pack-proxy src/benchmark/autonomous-pack/v1/model-proxy.ts src/benchmark/autonomous-pack/v1/model-endpoint.ts src/benchmark/autonomous-pack/v1/provider-usage.ts |
  docker build --platform linux/amd64 -f Dockerfile.autonomous-pack-proxy -t lorelum-autonomous-pack-proxy:v1 -
docker image inspect --format '{{.Id}}' lorelum-autonomous-pack:v1
docker image inspect --format '{{.Id}}' lorelum-autonomous-pack-proxy:v1
```

Node/Python 示例可在现有基础镜像上构建组合环境：

```sh
docker build --build-arg AUTONOMOUS_PACK_BASE=lorelum-autonomous-pack:v1 \
  -f Dockerfile.autonomous-pack-python -t lorelum-autonomous-pack:node-python .
docker image inspect --format '{{.Id}}' lorelum-autonomous-pack:node-python
docker image inspect --format '{{.Id}}' lorelum-autonomous-pack-proxy:v1
```

示例环境 [`environment.yaml`](../environments/autonomous-pack/v2/environment.yaml) 声明 Node 26.13.0 和 Python 3.13.5。Dockerfile 固定 Python 软件包版本，但上游 apt 仓库及其他系统包可能变化；实际计划绑定最终镜像 ID，完整复现仍需保留或受控分发该不可变镜像。更换 embedding profile、模型或运行时，须提供与实际设置一致的版本化环境 manifest 和镜像，不要沿用不匹配的示例声明。

排查网络问题时，可选用 `bun --no-env-file run environments/autonomous-pack/v1/egress-preflight.ts '<Agent镜像完整ID>' '<代理镜像完整ID>'`；它使用合成凭据、本地 HTTPS 服务、`openssl` 和 Docker，不是 pilot 的额外运行门槛。每次 pilot 仍核对该次容器拓扑；配置观察不能证明完整网络隔离或上游不会回显凭据。代理的请求数量上限与两组的轮次上限相同，不是 token 或费用上限。

Agent 可直接从 shell 使用原生 Lore CLI，也可使用 `lore_query` 和 `lore_get` 工具。`lore_query` 返回 Practice 的标题和适用条件等元数据；Agent 若需要完整内容，可自行用 `lore_get` 按 ID 读取。两组使用相同的通用系统提示，不指定查询内容，也不要求调用。

普通 Pi 轨迹不能完整覆盖 shell 内的调用；存在可能绕过时，检索状态标为 `indeterminate`，不推断为未查询。轨迹可能包含查询及代码，只能作为受控材料处理。

调用方进程中已存在的环境变量可能优先于仓库 `.env`。真实运行前确认实际生效的 `LORELUM_PI_BASE_URL` 和 `LORELUM_PI_API_KEY` 来自预期配置；不要输出、记录或提交 key。纯离线验证使用 `bun --no-env-file` 并移除相关凭据。

#### 冻结 Pack 并准备两组索引

`src/benchmark/autonomous-pack/v1/snapshot.ts` 的 `snapshotPack(source, destination)` 将源目录复制到不存在的目标目录，拒绝符号链接，并用 `autonomous-pack-tree/v1` 树摘要核验复制前后内容：包含隐藏文件和空目录，不包含跨操作系统不稳定的文件权限。该摘要与仓库其他历史目录摘要算法不同，不能互换；旧算法产生的试验性 Pack 摘要和索引归档需要重新准备。目标应放在隔离的 artifact 存储，不应放进 Agent 任务目录或 Git 提交。保留快照本身、digest、Lore 版本、安装返回的 artifact digest、模型及检索 profile 和索引身份；不同算法的 digest 不应假定相等。

公开工作区在 Linux 上统一将文件和目录模式设为 `0777`，不继承源执行位；其宿主私有父目录仍受限。Windows Docker Desktop 的共享挂载权限由 Docker 管理；该归一不修改源快照或私有 evaluator。

在支持 shell 的环境中，设置 `PACK_SOURCE` 为本地实际工作树、`PACK_SNAPSHOT` 为尚不存在的隔离目标路径，然后运行：

```sh
export PACK_SOURCE PACK_SNAPSHOT
PACK_SHA="$(bun --no-env-file -e 'import {snapshotPack} from "./src/benchmark/autonomous-pack/v1/snapshot"; console.log(await snapshotPack(process.env.PACK_SOURCE, process.env.PACK_SNAPSHOT));')"
export PACK_SHA
```

应检查命令退出状态并持久保存快照和 `PACK_SHA`；不要将两个路径都指向 Pack 工作树，也不要把快照目录放在源目录内部。

每个运行只从 `public/task.md` 与 `public/starter/` 创建干净工作区；`private/` 中的 evaluator、oracle、校准和评分不能进入 Agent 输入。安装 Pack 不等于语义索引就绪：固定 embedding 模型内容及 `encodingId`，并将 `query.retrievalMethod` 配置为与工具使用的 `single-vector` 一致；核验真实 Lore 返回的 index/profile 状态。`index status` 返回 ready 后，实际语义查询仍可能报告 indexing，因此还要检查查询结果的 profile 一致且 coverage 为 complete；`preparing`、`indexing`、失败或部分覆盖不能记为空结果或有效检索。
空 Store 的 `index status` 可以是 `missing`，但实际语义查询仍应成功返回相同 profile、complete coverage 和空结果；不可把它与安装组索引缺失混淆。索引就绪预检应在受控准备阶段进行，不向 Agent 提供检索词、结果或预选 Practice。

离线准备索引前，需要与 `environments/autonomous-pack/v1/environment.yaml` 一致的 embedding 模型文件 `model.gguf`。可预先提供已核验文件；若本机已安装兼容的 Lore，也可用 `lore model load` 准备默认缓存。该命令可能启动或复用本机 Lore backend，并可能联网下载模型；运行前应确认本机环境和网络策略。默认缓存一般位于 `~/.lorelum/models/<MODEL_SHA>/model.gguf`，实际路径以本机配置为准。

下列身份对应当前 `autonomous-pack/v1` 环境；升级 Lore 或 embedding 模型时应建立并核验相应的新环境，而不是只改摘要。`MODEL_DIR` 是包含 `model.gguf` 的目录。Windows 使用本机 `C:/...` 或 `E:/...` 形式的绝对路径。

```sh
export IMAGE="$(docker image inspect --format '{{.Id}}' lorelum-autonomous-pack:v1)"
export MODEL_SHA="18e8ce8ce834790618e90d26bed465cca87362076f3042eb0d8eee0732596f59"
export ENCODING_ID="ed34b3105cb6c3ab217fdb7b7c926c05808bd47474468c2f74a5110a590a42de"
export PROFILE_ID="f86744be739936072d165f616c596c3e2fe6fb26233bdf5ae7d0093843f134f0"
export MODEL_DIR="/absolute/path/to/model-directory"
export MODEL_FILE="$MODEL_DIR/model.gguf"
export EMPTY_DIR="/absolute/path/to/new-empty-index"
export INSTALLED_DIR="/absolute/path/to/new-installed-index"
mkdir "$EMPTY_DIR" "$INSTALLED_DIR"
```

用以下命令核验 `MODEL_FILE`；不匹配时不要继续：

```sh
bun --no-env-file -e 'import {sha256File} from "./src/benchmark/fs"; if (await sha256File(process.env.MODEL_FILE) !== process.env.MODEL_SHA) throw new Error("Embedding model digest mismatch"); console.log("Embedding model digest verified");'
```

两份输出目录必须是新建空目录，且当前用户可写。下面命令以当前用户的 UID/GID 运行准备容器，使宿主能读取生成的归档；不会修改 Pack 或模型源文件：

```sh
docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --user "$(id -u):$(id -g)" --pids-limit 256 --memory 3g --workdir /tmp \
  --tmpfs /tmp:rw,nosuid,nodev,size=2g,mode=1777 \
  --mount "type=bind,src=$PACK_SNAPSHOT,dst=/pack,readonly" \
  --mount "type=bind,src=$MODEL_DIR,dst=/model,readonly" \
  --mount "type=bind,src=$OUT,dst=/out" \
  --entrypoint bun "$IMAGE" run /opt/autonomous-pack/src/benchmark/autonomous-pack/v1/index-prepare.ts \
  "$CONDITION" "$PACK_SHA" "$MODEL_SHA" "$PROFILE_ID" "$ENCODING_ID" > "$OUT/metadata.json"
```

分别以 `CONDITION=empty-store` 和 `CONDITION=pack-installed`、不同的空 `OUT` 运行。命令核验 Pack 和模型内容、真实语义查询 coverage、profile、模型编码及停止后的 backend，并将身份 JSON 保存为 `metadata.json`。`OUT/index.tar` 包含完整 Store 和 cache，保留安装 Pack 的相对符号链接；`index_sha256` 是该归档实际字节的 SHA-256，必须与归档及元数据一同保存。只对已验证摘要的归档在新隔离目录中恢复；不要将准备产物挂载到 Agent 公开任务目录。本命令不启动编码 Agent，也不生成 benchmark record。
镜像内 `index-restore.ts` 在启动 Agent 前验证模型和归档摘要、拒绝越界归档路径与不安全链接，然后将 `store` 恢复到 `$HOME/.lorelum`、将 `cache` 恢复到 `$HOME/.lorelum/cache`，并写入相同 embedding 和 `single-vector` 配置。原生 `lore` 默认路径与专用工具显式使用的 Store、cache 因而一致。

### 准备、运行与报告

先创建本地受控 JSON 配置；以下路径和摘要需替换为本机真实值，不能填入 API key。`packSource` 指向准备索引所用的 `PACK_SNAPSHOT`；`modelParameters` 是已有的 JSON 文件，格式为 `{"api_model_id":"...","context_window":1000000,"max_tokens":384000}`，参数必须与环境声明和 Pi 目录模型一致；该输出上限不是费用上限。`systemPrompt` 是两组共用的公开文本，不能包含题目专属 query 或私有材料。例如：

```text
You are a coding agent. Complete the user task using the available tools. Lore is an optional knowledge search tool: lore_query returns Practice titles and applicability metadata, while lore_get reads a Practice by ID. Decide independently whether either tool would help.
```

```json
{
  "id": "comparison-001",
  "tasks": ["/absolute/path/to/config-migration-v2", "/absolute/path/to/csv-import-v3"],
  "packSource": "/absolute/path/to/actual-pack",
  "environment": "/absolute/path/to/environments/autonomous-pack/v2/environment.yaml",
  "agentImage": "sha256:<complete-agent-image-id>",
  "proxyImage": "sha256:<complete-proxy-image-id>",
  "modelParameters": "/absolute/path/to/model.json",
  "systemPrompt": "/absolute/path/to/system.txt",
  "modelFile": "/absolute/path/to/embedding-model.gguf",
  "indexes": {
    "empty": {"archive": "/absolute/path/to/empty/index.tar", "metadata": "/absolute/path/to/empty/metadata.json"},
    "installed": {"archive": "/absolute/path/to/installed/index.tar", "metadata": "/absolute/path/to/installed/metadata.json"}
  },
  "repetitions": 1,
  "orderSeed": 8,
  "budget": {"max_turns": 20, "max_duration_ms": 480000},
  "auditWaitMs": 30000
}
```

所有路径必须是绝对路径。Windows 上使用 Bun 可识别的 `E:/...` 路径。准备和运行分别从环境变量读取 `LORELUM_PI_BASE_URL`，运行还读取 `LORELUM_PI_API_KEY`；不要将凭据写入 JSON、终端输出或 Git。准备时绑定端点摘要，但不调用模型：

```sh
bun --no-env-file run bench prepare /absolute/path/to/config.json /absolute/path/to/new-prepared-dir
bun --no-env-file run bench run /absolute/path/to/new-prepared-dir/pilot.json
bun --no-env-file run bench report /absolute/path/to/new-prepared-dir/output
```

新目录必须不存在、父目录必须存在，且输出不能覆盖输入。`pilot.json` 包含本机路径和执行计划，不含凭据；计划绑定任务声明和校准摘要、公开输入、私有 evaluator、环境、镜像、Pack、索引、模型及预算。`plan.json` 是 v2 外层计划，`execution-plan.json` 是供既有调度器使用的派生计划，`execution.json` 绑定两者身份；历史 v1 计划和结果不会被覆盖。CLI 不向终端回显来源不可信的异常内容；失败时检查本机受控配置和对应私有输出。

准备、交接包校验和运行前冻结输入使用同一执行输入契约；缺少 embedding、模型参数非法或索引身份不匹配都会被拒绝。运行前仍重新核验已冻结的字节及其摘要。

`summary.json` 保留计划总数、不可比较与缺失原因；功能、质量、检索、健康及成本独立解释。默认不运行质量评估，不以零分代替；普通轨迹无法覆盖 shell 内的 Lore CLI 调用时，整体检索仍为 `indeterminate`。模型或 verifier 故障不等于功能失败。固定相同时间和轮次预算，不承诺 token 或费用封顶。

### 受控交接

仅在有权复制和分享所有内容时导出私有复现包：

```sh
bun --no-env-file run bench bundle export /absolute/path/to/new-prepared-dir/pilot.json /absolute/path/to/new-bundle --include-private
bun --no-env-file run bench bundle verify /absolute/path/to/new-bundle
bun --no-env-file run bench bundle run /absolute/path/to/new-bundle /absolute/path/to/new-output
```

该包包含完整 Pack 快照、公开任务、**私有 verifier 和校准解**、embedding 模型及两组索引；它不包含模型凭据、Agent 轨迹、工作区或 diff，不能当成公开报告。镜像本身不在包内，需要另行按计划中的不可变镜像 ID 分发；端点 URL 和凭据也须另行安全配置，且 URL 摘要必须与计划一致。原计划中的本机快照 URI 只保留为来源信息，恢复运行使用 bundle 内的相对内容。导出和校验均比较内容摘要、任务契约与计划，协作者仍应确认 Pack 和模型分发授权。

交接包清单的结构、摘要格式和相对路径格式由 schema 一次校验；随后检查条目与计划的对应关系、路径穿越和符号链接，以及实际内容与计划的身份。恢复执行时重新核验冻结输入，不依赖导出时的检查结果。
