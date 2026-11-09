# 自主 Pack 对照：维护与离线验证

本文描述 Issue [#242](https://github.com/lorelum/lorelum-benchmark/issues/242) 的实验方法和当前已实现的离线组件，不是正式运行授权。**配对执行器尚未就绪，当前不能用本指南运行真实 Agent 对照或生成正式结论。**

## 对照与结论边界

两组使用相同 task、starter、系统提示、模型、工具、环境和预算；基线使用空 Lore Store，处理组只多安装固定 Pack。Agent 自行选择是否查询和读取 Practice，不由 benchmark 预先查询或注入。记录功能、质量、检索行为、运行健康与成本时分开报告；一次查询或一个成功题目不证明 Pack 提升了代码质量。

当前首个 Pack 源是本地 `E:/lorelum-packs/packs/agentic-coding` 工作树；它可能包含未提交内容，版本号和 Git commit 不能代替完整内容身份。不要在用户 Pack 仓库中覆盖已安装内容。

## 准备运行时与隔离镜像

工作区依赖的 Bun、Node 和 Pi 版本以及安装步骤见 [environments/README.md](../environments/README.md)。在仓库根目录的支持管道的 shell 中：

```sh
bun install --frozen-lockfile
tar -cf - Dockerfile.autonomous-pack package.json bun.lock environments/autonomous-pack/v1/entrypoint.sh |
  docker build --platform linux/amd64 -f Dockerfile.autonomous-pack -t lorelum-autonomous-pack:v1 -
docker image inspect --format '{{.Id}}' lorelum-autonomous-pack:v1
bun --no-env-file run environments/autonomous-pack/v1/isolation-preflight.ts '<上一条输出的完整镜像ID>'
```

构建使用固定的 Lore 发行包摘要；preflight 检查无网络容器的工具版本、文件和凭据隔离以及独立临时状态。**它不验证模型 API 的代理出站、语义索引或真实 Agent。** 仅凭镜像构建或离线 preflight 不得将运行记为有效对照。

镜像包含 Lore backend 验证进程身份所需的 `ps`，preflight 会检查该命令。模型代理组件只允许固定的 HTTPS 上游和指定模型；它还未接入配对执行器，单独启动代理或通过上述 preflight 都不能证明 Agent 的出站隔离。生产执行必须将代理与 Agent 放在不同的网络边界，并且不能把上游凭据传给 Agent。

## 冻结 Pack 与公开输入

`src/benchmark/autonomous-pack/v1/snapshot.ts` 的 `snapshotPack(source, destination)` 将源目录复制到不存在的目标目录，拒绝符号链接，核验复制前后内容并返回完整目录 SHA-256。目标应放在隔离的 artifact 存储，不应放进 Agent 任务目录或 Git 提交。保留快照本身、digest、Lore 版本、安装返回的 artifact digest、模型及检索 profile 和索引身份；不同算法的 digest 不应假定相等。

每个运行只从 `public/task.md` 与 `public/starter/` 创建干净工作区；`private/` 中的 evaluator、oracle、校准和评分不能进入 Agent 输入。安装 Pack 不等于语义索引就绪：固定 embedding 模型内容及 `encodingId`，并将 `query.retrievalMethod` 配置为与工具使用的 `single-vector` 一致；核验真实 Lore 返回的 index/profile 状态。`index status` 返回 ready 后，实际语义查询仍可能报告 indexing，因此还要检查查询结果的 profile 一致且 coverage 为 complete；`preparing`、`indexing`、失败或部分覆盖不能记为空结果或有效检索。
索引就绪预检应在受控准备阶段进行，不向 Agent 提供检索词、结果或预选 Practice。

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
