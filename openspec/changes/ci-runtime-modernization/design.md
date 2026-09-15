## Context

Issue #212 收住的是一个仓库级 CI/runtime 问题，不是 #196 candidate 的实现范围。当前 `.github/workflows/validate.yml` 同时监听 `push` 和 `pull_request`，导致同一 PR commit 重复跑；workspace job 还在两个操作系统上重复执行全部 runner/coordinator 契约。formal-container 和 realistic-repository 也被所有 PR 无条件触发。与此同时，Windows 本地生成的混合换行会被 Git checkout 为 LF，v1 snapshot 使用工作区原始字节计算 hash，因此会出现“本地通过、CI 失败”。

变更必须保持 benchmark 生命周期隔离：不改写已有 task/snapshot/record，不把新 runtime 自动写入历史 incubator 条件，不调用模型，不改变 formal experiment 的语义。正式实验若需要采用新 runtime，必须在本 change 后新建 environment version/experiment plan。

## Goals / Non-Goals

**Goals:**

- 统一并可审计地固定 Bun `1.4.2`、Node `24.21.0`（LTS）和 Pi `0.85.1`。
- 让每个 PR 的快速 required CI 只执行一次；新提交取消同一 PR/ref 的过期 run。
- 保留 Ubuntu/Windows 的快速验证，隔离较慢或与改动无关的 runner、Docker、Playwright 检查。
- 使 v1 snapshot 的文本输入遵循仓库的 LF canonical 规则；v2 继续使用既有字节级 canonical Merkle 规则。
- 让 runner/coordinator integration 测试的 timeout 反映真实跨平台进程启动成本，且不放宽正式 run budget。

**Non-Goals:**

- 不删除 snapshot、coordinator、formal-container 或 realistic-repository 测试逻辑。
- 不修改 `suites/`、已使用 snapshot、正式 record、evaluator、oracle、Practice、scoring 或模型协议。
- 不更新历史 incubator `private/conditions.yaml` 中已声明的 Pi 版本。
- 不在此 change 中实现 #197 staged runner、#199 treatment、#200 JudgeAgent 或 #202 evaluator。

## Decisions

### 1. Runtime pins use latest stable Bun plus current Node LTS and Pi latest

采用 Bun `1.4.2`、Node `24.21.0` 和 `@earendil-works/pi-coding-agent` `0.85.1`。Node 使用 LTS 而不是 current `26.x`，因为正式 benchmark 优先稳定、可复现和长期支持；Pi 包的 lockfile 继续记录所有传递依赖的完整版本和 integrity。package `engines.node` 固定为 `24.21.0`，以避免本地/CI 误用旧 Node。

备选方案：继续使用 range 或只升级 CI。未采用，因为会让 formal image、环境 manifest 和本地执行出现版本漂移；只升级 CI 又不能重建正式容器。

### 2. CI uses one validation workflow for PR/main and path-scoped heavy workflows

快速 workflow 只监听：

```yaml
push:
  branches: [main]
pull_request:
  branches: [main]
```

并使用 `concurrency.group = validate-${{ github.event.pull_request.number || github.ref }}` 与 `cancel-in-progress: true`。这样 feature branch push 不再额外触发一套重复 workflow，main 合并后仍会有一次 post-merge validation。

workspace-fast 保留 Ubuntu/Windows，但只运行 `validate`、OpenSpec governance 和核心 deterministic contracts。#196 candidate 尚未进入 `origin/main`，因此其 public starter smoke 不在本 change 中跨 PR 引用；候选合并后由其自身 change/后续 CI 调整接入。runner/coordinator integration、formal-container、realistic-repository 各自通过路径触发的 workflow 保留，避免普通文档或 candidate-only PR 被高成本检查阻塞。 runner integration 的路径集合同时包含其独立启动脚本和 `validate.yml` 本身，避免只修改测试编排时跳过被修改的集成门禁。

备选方案：只删除 Windows、只删除 push 事件或直接删掉慢测试。未采用：Windows 仍覆盖真实路径行为；删除 push 会丢失 main post-merge 信号；测试逻辑仍然有 benchmark 价值，应调整触发和边界而非删除。

### 3. Snapshot v1 adds a scoped canonical text digest without changing shared exact-file hashes

snapshot v1 的 candidate file manifest 使用专用的 snapshot digest：对 UTF-8 文本把 CRLF/孤立 CR 规范化为 LF 后计算 SHA-256；二进制或非文本文件仍按原始字节计算。该逻辑只在 `snapshot.ts` 组装 v1/v2 输入文件 manifest 时使用，不改变 `sha256File` 对 environment lockfile、prompt、record artifact 等 exact-byte contract 的既有含义。v2 canonical tree 继续按现有 spec 使用文件字节级 hash；新 candidate 应优先采用 v2，但历史/现有 v1 输入保持 v1 格式。

同时增加测试：同一 candidate 的 LF、CRLF 和混合换行工作区生成相同 v1 snapshot identity；损坏 UTF-8/二进制不被文本转换误处理。

备选方案：要求每个维护者手工运行 `git add --renormalize`。未采用，因为不能保护 future candidate authoring，也无法在工具层提供可验证的跨平台行为。

### 4. Integration tests get explicit test timeout and fixture budget

`contract-app.test.ts` 的每个 subprocess-backed test 使用 Bun 支持的显式测试 timeout（目标 60 秒）；其 synthetic run budget 调整为 30 秒，只用于测试 runner/coordinator 的 process lifecycle，不改变 production runner 对请求中 `max_duration_ms` 的遵守。失败后继续清理 `.run-workspaces`、`artifacts/runs`、`results/records` 和 temporary environments。

备选方案：把整个 `test:contracts` 的 job timeout 无限放大。未采用，因为会掩盖 dangling process；测试本身必须有界并输出可诊断 artifact。

### 5. Active environment manifests are versioned before formal use

formal Pi environment 尚无正式 record，因此在没有运行记录的前提下同步其 runtime/dependency identity；local-pi/local-wsl manifests 同步到新 runtime。历史 incubator condition pins 不变。若新 runtime 被用于正式记录，先创建新的 environment version 和 experiment plan，不能原地改写已有 record 的 provenance。

## Risks / Trade-offs

- [Runtime upgrade regression] Pi 0.85.1 或 Bun 1.4.2 可能改变 CLI/Node compatibility。→ 先执行 lockfile install、Pi `--version`、runner v2 contract 和 sandbox image assertion；失败时不生成 record。
- [CI required-check rename] 拆分 workflow 可能让仓库设置中的旧 required check 名称失效。→ 在 PR 中列出旧/新 job name 映射，合并前读取 branch protection/required checks（若权限可见）并更新设置。
- [Snapshot semantic drift] v1 文本规范化可能改变尚未记录的候选 snapshot ID。→ 只对未产生 record 的候选重新生成 snapshot；历史 v1 和 v2 走原有版本路径，变更必须在 snapshot tests 中锁定。
- [Timeout masks a real hang] 更大 timeout 可能延迟失败。→ 保留 job-level timeout、子进程 tree termination、afterEach/afterAll cleanup，并把 integration workflow 与快速 required gate 分离。
- [Heavy workflow path omissions] 路径过滤可能漏掉间接影响。→ 对 package/lockfile、runner/sandbox、workflow、environment 和 calibration source 使用保守路径集合，并保留手动 workflow dispatch。

## Migration Plan

1. 创建初始 PR，只提交本 OpenSpec artifacts；strict validation 通过后再实现。
2. 在同一分支先升级 package/lockfile/runtime manifests/docs，并运行本地 version/preflight 检查。
3. 加入 snapshot canonical digest 与 focused tests，刷新仅限未记录 candidate 的 snapshot；验证 `bun run validate`。
4. 拆分 CI workflows，先用 pull request run 验证快速/重型 jobs，确认 concurrency 与路径触发后再合并。
5. 若回滚，恢复 workflow 与 runtime pins；任何使用新 runtime 的正式 run 必须使用新 environment version，不复用旧 record provenance。

## Open Questions

- 已按 issue #212 的默认决策选择 Node `24.21.0` LTS，不采用 current `26.x`。
- 已按 issue #212 的默认决策保留测试逻辑、拆分快速与 integration workflow，并以路径过滤减少无关高成本运行。
- #196 candidate smoke 不作为本 PR 的 required gate，待 #196 合并后再由独立变更接入。
- 需要在实现前确认仓库分支保护中实际要求的 check 名称；无权限读取时以 PR checks 与 workflow lint 作为证据并在 PR 中标注。
