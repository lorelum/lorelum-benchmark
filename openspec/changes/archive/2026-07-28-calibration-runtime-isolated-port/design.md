## Context

Issue #109 addresses a concurrency hazard in the private calibration runtime.
The two `injection-calibration/v1` incubator candidates from #97 (and their
#106 overlay migration) each run a Playwright calibration matrix that starts a
Vite dev server. The base `playwright.config.ts` fixes `webServer.url` and the
`bun run dev -- --host 127.0.0.1 --port 4173` command to `127.0.0.1:4173`, and
every composed fixture tree inherits this base. When two candidate calibrations
run concurrently one process fails to bind `4173`; serial execution passes.

The calibration runtime is private and kernel-driven: the `calibrate` subcommand
resolves calibration sets, stages a temporary private tree, and invokes each
declared calibration role with a private runtime environment. The role command
runs `bun run test`, which Playwright drives against the fixed port. There is
currently no per-invocation port ownership, allocation, or injection contract.

The implementation must give each concurrent calibration invocation an exclusive
local port (or equivalent private base URL), prove Playwright and Vite consume
the same value, fail closed when allocation or consumption fails, and keep the
port inside the private calibration runtime. It must not change #75/#97 task
wording, Practice, source pin, quality gates, or prior calibration conclusions,
and it must not rewrite existing immutable registry bases or calibration sets.

## Goals / Non-Goals

**Goals:**

- Provide an exclusive, auditable per-invocation port or private base URL for
  each kernel-driven calibration role invocation, with no TOCTOU gap between
  the private driver's bind and its use.
- Have the private driver derive Playwright's base URL from the Vite server it
  atomically starts, so both consumers use the same private runtime.
- Fail closed with private diagnostics on allocation failure, invalid values,
  service-not-ready, timeout, and double-release.
- Keep the port/base URL inside the private calibration runtime; it must not
  appear in agent workspace, public prompt, ordinary snapshot files, Practice
  payload, trace, or record.
- Express any affected fixture configuration as new immutable registry base
  and calibration set versions; do not rewrite existing versions.

**Non-Goals:**

- Changing #75/#97 task wording, Practice, public behavior, source pin, quality
  gates, or prior calibration conclusions.
- Copying or rebuilding the #106 overlay resolver; #109 builds on it unchanged.
- Global CI serialization, reusing an existing service, fixed ports, or
  unauditable random port guessing.
- Snapshot v2, formal records, or Pi/model/retrieval/blind-review execution.

## Decisions

以下为规划澄清阶段确认的结论，已固定为本 change 的设计约束。

### #108 依赖策略

PR #108（overlay resolver、private staging 与 `calibration_sets_hash`）已合并进
`origin/main`（commit `51e2681`）。本 change 直接基于最新 `origin/main` 实现，不复制
或重建 overlay 机制。materializer、isolate、driver、evaluator 与 snapshot 继续沿用 #106
的共享合成 fixture resolver 与身份边界，不分叉。

### Port ownership and allocation（端口所有权与分配，防 TOCTOU）

kernel `calibrate` 启动每个 private calibration role；role 内的 private driver 创建本地
HTTP server 并以 `127.0.0.1`、`port: 0` 原子绑定，再通过禁用 HMR 的 Vite middleware API
将 Vite 挂载到该已监听服务并读取实际端口。服务自身是该端口的唯一所有者，没有"先探测空闲
端口再重新绑定"的 TOCTOU 窗口，也不存在把 kernel 预占 socket 交给 Vite CLI 的不可能交接。
绑定、地址读取、就绪检查或关闭失败均使 role fail closed。

### Injection contract（注入契约）

private driver 在 Vite 监听后构造私有 `http://127.0.0.1:<actual-port>` base URL，并仅在
启动 Playwright 时通过 `PLAYWRIGHT_BASE_URL` 注入。Vite 是该值的来源，Playwright 使用
同一值并禁用固定 `webServer`。Vite 未返回有效本地地址、服务未就绪、或 Playwright 缺失
该值/回退固定 `4173` 时，role fail closed 且不产生有效校准结论。

### Failure, timeout and release semantics（失败、超时与释放语义）

服务未就绪、超时、原子绑定/地址读取失败或 Vite 关闭失败均使 role fail closed 并保留
私有诊断；不产生部分有效的校准结论。私有诊断只在 calibration 进程内输出，不进入公开产物。

### Migration strategy（迁移策略）

创建新的 immutable registry base 版本（`app-shell/v2`）承载端口感知的
`playwright.config.ts`/`vite.config.ts`；现有 base/source 版本（`app-shell/v1`）保持
不变。两个 #97 candidate 新增 `quality-probe/v2` calibration set，旧 `quality-probe/v1`
不被改写。`v2` 仅替换 base，并有意引用已冻结的 `v1` overlay 内容；该复用不改变 `v1`
identity。为新 set 重建并复核 snapshot 身份，旧 set 源码与身份从提交历史保持可复现。

### Concurrent integration test（并发 integration test）

至少两个 candidate/fixture 同时运行，验证无 `EADDRINUSE`、无跨 invocation 串扰、并行
结果与串行基线一致。snapshot 更新为新 set 身份；旧 set 身份不被改写。

## Risks / Trade-offs

- [A discover-then-bind gap causes TOCTOU races] -> Let the private driver's
  HTTP server bind port `0`, attach Vite as middleware, and read the address
  only after it is listening; never reserve a port in one process and rebind it
  in another.
- [Playwright and Vite consume different values] -> The private driver reads
  Vite's actual address and passes that exact value only to Playwright.
- [Port leaks across concurrent invocations] -> Per-invocation ownership with
  verified release; held ports are never reused within one runtime.
- [Port information leaks into public artifacts] -> Port stays in the private
  runtime environment; snapshot ordinary files and traces record only version
  and hash.
- [Rewriting existing sets changes prior conclusions] -> New base/set versions;
  old versions stay immutable and reproducible.

## Migration Plan

1. Complete strict OpenSpec validation and create this change's OpenSpec-only
   PR.
2. Record the confirmed allocation, injection, failure, migration, and #108
   dependency decisions in this design and `tasks.md`.
3. Implement the service-owned port binding, injection contract, and fail-closed tests
   before changing any candidate source.
4. Add the port-aware base version and `quality-probe/v2` sets for the two #97
   candidates; regenerate and verify snapshots without changing public
   behavior, Practice, source pin, or quality gates.
5. Add a concurrent integration test asserting no `EADDRINUSE`, stable results,
   and serial-baseline equivalence.

## Confirmed Evolution Model

New calibration set versions express port-aware configuration changes. Existing
sets and registry bases remain immutable and reproducible from their committed
history. A candidate adds a new set/version rather than rewriting an existing
one; the aggregate resolved hash changes for the current snapshot while prior
identity stays intact.
