# 自主 Pack 对照：维护与离线验证

本文描述 Issue [#242](https://github.com/lorelum/lorelum-benchmark/issues/242) 的实验方法和当前已实现的离线组件，不是正式运行授权。**配对执行器尚未就绪，当前不能用本指南运行真实 Agent 对照或生成正式结论。**

## 对照与结论边界

两组使用相同 task、starter、系统提示、模型、工具、环境和预算；基线使用空 Lore Store，处理组只多安装固定 Pack。Agent 自行选择是否查询和读取 Practice，不由 benchmark 预先查询或注入。记录功能、质量、检索行为、运行健康与成本时分开报告；一次查询或一个成功题目不证明 Pack 提升了代码质量。

当前首个 Pack 源是本地 `E:/lorelum-packs/packs/agentic-coding` 工作树；它可能包含未提交内容，版本号和 Git commit 不能代替完整内容身份。不要在用户 Pack 仓库中覆盖已安装内容。

## 准备运行时与隔离镜像

工作区依赖的 Bun、Node 和 Pi 版本以及安装步骤见 [environments/README.md](../environments/README.md)。在仓库根目录的支持管道的 shell 中：

```sh
bun install --frozen-lockfile
tar -cf - Dockerfile.autonomous-pack package.json bun.lock environments/autonomous-pack/v1/entrypoint.sh src/benchmark/fs.ts src/benchmark/autonomous-pack/v1/index-prepare.ts |
  docker build --platform linux/amd64 -f Dockerfile.autonomous-pack -t lorelum-autonomous-pack:v1 -
docker image inspect --format '{{.Id}}' lorelum-autonomous-pack:v1
bun --no-env-file run environments/autonomous-pack/v1/isolation-preflight.ts '<上一条输出的完整镜像ID>'
```

构建使用固定的 Lore 发行包摘要；preflight 检查无网络容器的工具版本、文件和凭据隔离以及独立临时状态。**它不验证模型 API 的代理出站、语义索引或真实 Agent。** 仅凭镜像构建或离线 preflight 不得将运行记为有效对照。

镜像包含 Lore backend 验证进程身份所需的 `ps`，preflight 会检查该命令。模型代理组件只允许固定的 HTTPS 上游和指定模型；它还未接入配对执行器，单独启动代理或通过上述 preflight 都不能证明 Agent 的出站隔离。生产执行必须将代理与 Agent 放在不同的网络边界，并且不能把上游凭据传给 Agent。

用户选择保留 shell 中的原生 Lore CLI。可用以下离线预检检查独立审计容器能否附着到测试容器，并看到一次真实的原生 CLI 调用和响应；需要 Docker 允许审计容器拥有 `SYS_PTRACE` 和指定的 seccomp 设置，Agent 测试容器不获得该 capability：

```sh
tar -cf - Dockerfile.autonomous-pack-audit |
  docker build --platform linux/amd64 -f Dockerfile.autonomous-pack-audit -t lorelum-autonomous-pack-audit:v1 -
docker image inspect --format '{{.Id}}' lorelum-autonomous-pack:v1
docker image inspect --format '{{.Id}}' lorelum-autonomous-pack-audit:v1
bun --no-env-file run environments/autonomous-pack/v1/audit-preflight.ts '<Agent镜像完整ID>' '<审计镜像完整ID>'
```

该预检只覆盖固定的单次 CLI 调用，不证明所有调用路径、审计完整性或输出解析已就绪。审计证据可能包含用户查询与工具输出，必须作为受控材料处理，不得进入 Agent 工作区或公开日志；当前运行遇到无法观测的 shell 调用仍标为不可判定。

调用方进程中已存在的环境变量可能优先于仓库 `.env`。准备真实运行前，操作者应确认实际生效的 `LORELUM_PI_BASE_URL` 和 `LORELUM_PI_API_KEY` 来自预期配置；不要输出、记录或提交 key。纯离线验证使用 `bun --no-env-file` 并移除进程环境中的相关凭据。

## 冻结 Pack 与公开输入

`src/benchmark/autonomous-pack/v1/snapshot.ts` 的 `snapshotPack(source, destination)` 将源目录复制到不存在的目标目录，拒绝符号链接，核验复制前后内容并返回完整目录 SHA-256。目标应放在隔离的 artifact 存储，不应放进 Agent 任务目录或 Git 提交。保留快照本身、digest、Lore 版本、安装返回的 artifact digest、模型及检索 profile 和索引身份；不同算法的 digest 不应假定相等。

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
  "$CONDITION" "$PACK_SHA" "$MODEL_SHA" "$PROFILE_ID" "$ENCODING_ID"
```

分别以 `CONDITION=empty-store` 和 `CONDITION=pack-installed`、不同的空 `OUT` 运行。命令核验 Pack 和模型内容、真实语义查询 coverage、profile、模型编码及停止后的 backend，并输出身份 JSON。`OUT/index.tar` 包含完整 Store 和 cache，保留安装 Pack 的相对符号链接；`index_sha256` 是该归档实际字节的 SHA-256，必须与归档一同保存。只对已验证摘要的归档在新隔离目录中恢复；不要将准备产物挂载到 Agent 公开任务目录。本命令不启动编码 Agent，也不生成 benchmark record。

## 候选任务与离线校准

`incubator/autonomous-pack/order-refunds-v1/` 是多文件退款服务候选，不是冻结的正式 suite 任务。私有 evaluator 由控制端运行，候选代码在无网络只读容器内通过通用 JSONL bridge 接收请求；私有断言不挂载给候选。先构建上述镜像，再在 PowerShell 中运行：

```powershell
$base = (Resolve-Path 'incubator/autonomous-pack/order-refunds-v1').Path
foreach ($name in 'valid-atomic','valid-queue','defect-idempotency','defect-balance') {
  $env:WORKSPACE = Join-Path $base "private/calibration/$name"
  node --test (Join-Path $base 'private/evaluator/semantic.test.mjs')
}
$env:WORKSPACE = Join-Path $base 'public/starter'
node --test (Join-Path $base 'private/evaluator/semantic.test.mjs')
Remove-Item Env:WORKSPACE
```

两种 `valid-*` 应通过，两个 `defect-*` 和未完成 starter 应失败。非零退出还可能是 Docker 不可用、超时或环境错误，必须检查具体原因，不可一律记为语义失败。任务细节与盲审维度见该候选 `private/README.md`；其内容不得复制给 Agent。

## 检查契约与解释结果

```sh
bun --no-env-file test src/benchmark/autonomous-pack/v1/trace.test.ts src/benchmark/autonomous-pack/v1/snapshot.test.ts src/benchmark/autonomous-pack/v1/plan.test.ts src/benchmark/autonomous-pack/v1/model-proxy.test.ts
bun --no-env-file src/benchmark/validate.ts
bun --no-env-file src/benchmark/snapshot.ts
openspec validate autonomous-pack-benchmark-242 --type change --strict --json
```

`schedulePlan` 生成固定配对次序，`summarizePlan` 将缺失、失败和不可比较的运行保留在计划分母；其输出不是正式 record。完整 trace 中的未查询、空结果、查询失败和读取失败是不同状态；trace 截断或无法观测的调用不能判为未查询。目前 shell 可以绕过专用工具调用 Lore，因此 trace 中有 `bash` 或 `powershell` 时审计保守标为不可判定；需要完整进程级检索观测后才能把这种运行纳入比较。功能是否完成由语义断言决定，架构及可维护性为独立质量证据，不使用隐藏加权总分。

用户已取消严格总 token 上限；两组仍须使用相同的时间和轮次预算。后续真实运行应分别记录供应商返回的输入、输出、总 token 和费用，缺失或异常时标为不可用，不用估计冒充实测。**这不提供严格 token 或费用封顶**；真实模型运行、正式记录和提升为 suite revision 仍需各自的生命周期、安全和授权门禁。
