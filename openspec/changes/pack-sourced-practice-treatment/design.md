## Context

P1 的因变量是同一长任务会话中 Practice delivery node 的差异。#199 不是 Lorelum
Pack 查询产品的实现，而是为 #197/#201 提供一次性选定、可审计、不可漂移的 treatment。
#196 已在主线提供异步报表 candidate 和 `scope_changed` 的三阶段任务语义；#197 负责把
固定 treatment 在三个 node 送达；#202 只根据公开行为判定硬语义，不能读取 Pack provenance
或 Practice 内容。

上游当前有两个影响设计的事实。第一，`agentic-coding@0.4.0` 已发布，但
`replan-on-material-drift` 从 `v0.3.0` 到 `v0.4.0` 的正文 hash 不变；由于实验尚未开始，按需求方确认采用最新已发布的 `agentic-coding-v0.4.0`；锁定其
annotated tag 对应 commit
`df89b8d432a01c53361a0e23df6896a772942b09`。第二，Lorelum 的 `lore get` 已把 source
locator 作为 `packRoot` 返回，但它是可变 current view；treatment 必须保存 tag/ref 和
内容身份，不能把本地 `packRoot` 当作不可变 provenance。

## Goals / Non-Goals

**Goals:**

- 用一个版本化 manifest 固定 Pack repository、tag/ref、resolved commit、Pack version、
  Practice ID、source path、Lore content digest、正文 SHA-256、selection query/provenance
  和适用性判定。
- 在独立 prepare 阶段真实执行一次 Lore query/get，生成 private frozen snapshot；三处 delivery 消费同一已校验 payload，九次运行中不再 query/get、不重排、不 fallback 到另一条 Practice。
- 让 baseline/未声明 condition fail closed；Practice card 只走
  `condition-scoped-private-runtime`，不物化到 workspace，不进入 public task/starter。
- 让 #197 能记录 `treatment_id`、`treatment_version`、`practice_id`、`practice_sha256`
  和 delivery outcome，同时在 benchmark audit sidecar 保存完整 Pack provenance。
- 以 mock/fixture 验证 identity、card consistency、applicability 和泄露边界；CI 不调用真实 Lore/模型，生产 prepare adapter 通过可注入命令 runner 调用标准 Lore CLI。

**Non-Goals:**

- 不把完整 Pack 镜像、`packRoot`、SQLite/Store 路径或 private source artifact 传给 Agent。
- 不把 `applies_when` 的语义判断伪装成 query ranking 的自动质量分；本 change 保存人工确认
  的适用性 basis，并做确定性字段/fixture 校验。
- 不要求 #199 直接改 staged runner 的 session/node scheduling；runner 仅消费本 change
  输出的 contract。

## Upstream-derived decisions

### 固定 release，而非 latest

- `pack.repository`: `https://github.com/lorelum/lorelum-packs.git`
- `pack.ref`: `agentic-coding-v0.4.0`
- `pack.version`: `0.4.0`
- `pack.commit`: `df89b8d432a01c53361a0e23df6896a772942b09`
- `practice.id`: `agentic-coding.implementation.replan-on-material-drift`
- `practice.source_path`:
  `packs/agentic-coding/practices/implementation/replan-on-material-drift.md`
- source SHA-256:
  `eaec0e27c85f5df6553eccf5cbcb521d2975aecfb0a3ffd0b7d754c89afa2909`
- Lore canonical content digest:
  `8913dc851d1b51e5610010b8ea9804b47c31109b8514620187f54e00ca7eb3f9`
- injected card SHA-256:
  `4a8de5d1546bfd7ed074b8f40e06ad142c4cb79ebdc90781f4b5c87b1bf03b97`

The query is executed once by the prepare adapter, not by #197/#201 delivery execution. It must
use semantic mode and describe the task moment and decision boundary without naming the expected
Practice ID. The expected Practice ID must appear in the returned top-k result set; absence is an
indeterminate preparation result, not a reason to select another card. The adapter then calls `get`
once for that exact ID, records the normalized result and command provenance, and writes a frozen
snapshot. If the upstream ref, ID, source, digest, source hash, or card hash differs, preparation
fails closed.

### Applicability to `scope_changed`

The fixed scenario is: after an initial implementation plan for the async report lifecycle, the
user adds old/new client and worker concurrency plus deploy rollback constraints. This is a material
change to delivered behavior, failure modes, and required verification. The private selection record
must state that the selected Practice's `applies_when` is reviewed against these three observable
changes and must include the review basis without adding hidden acceptance answers to the public task.

### Delivery and audit boundary

- The delivery form is `practice-card` and the injection channel is
  `condition-scoped-private-runtime`.
- A delivery payload contains only the selected Practice body and stable treatment metadata needed
  by the runner. It is not staged as a file in the Agent workspace.
- Public/Agent-visible trace fields are limited to treatment version/hash and delivery status. A
  non-Agent benchmark audit sidecar records Pack repository/ref/commit/version, Practice ID,
  source path, Lore content digest, body hash, selection provenance, applicability basis and
  the three-node identity comparison.
- A baseline or undeclared condition has no payload and is an error if any Practice body/hash is
  observed. A delivery failure is explicit `failed`/`unsupported`/`indeterminate`; it must not
  silently move to another node or Practice.

## Proposed contract shape

The exact field names are implementation details to be frozen in the schema task, but the contract
must have these logical groups:

The prepare adapter uses these standard commands with an isolated Store:

```sh
lore --store-root "$STORE_ROOT" pack install agentic-coding@0.4.0 --registry lorelum/lorelum-packs
lore --store-root "$STORE_ROOT" query "$QUERY" --mode semantic --top-k 5
lore --store-root "$STORE_ROOT" get agentic-coding.implementation.replan-on-material-drift
```

CI injects a command runner and fixture stdout; it does not invoke real Lore or a model.

```yaml
schema_version: pack-practice-treatment/v1
id: agentic-coding-replan-on-material-drift
version: v1
kind: retrieval
injection:
  delivery: practice-card
  channel: condition-scoped-private-runtime
pack:
  repository: https://github.com/lorelum/lorelum-packs.git
  ref: agentic-coding-v0.4.0
  version: 0.4.0
  commit: df89b8d432a01c53361a0e23df6896a772942b09
practice:
  id: agentic-coding.implementation.replan-on-material-drift
  source_path: packs/agentic-coding/practices/implementation/replan-on-material-drift.md
  content_digest: 8913dc851d1b51e5610010b8ea9804b47c31109b8514620187f54e00ca7eb3f9
  source_sha256: eaec0e27c85f5df6553eccf5cbcb521d2975aecfb0a3ffd0b7d754c89afa2909
  card_sha256: 4a8de5d1546bfd7ed074b8f40e06ad142c4cb79ebdc90781f4b5c87b1bf03b97
selection:
  mode: semantic
  query_sha256: <canonical query hash>
  resolved_once: true
applicability:
  scenario: async-report-lifecycle/scope_changed/v1
  status: reviewed
  basis_sha256: <private applicability basis hash>
privacy:
  materialization: forbidden
  secrets: excluded
```
The schema task may choose a more precise versioned kind or split the audit sidecar schema, but
must not weaken the identity or isolation requirements above.

## Implementation order and validation

1. Record the confirmed prepare/query/runtime boundary in Issue #199 and this OpenSpec change.
2. Add the versioned schema, prepare command adapter, private canonical practice/reference and immutable provenance/applicability fixture.
3. Implement resolver/validator with an injectable Lore command runner; production prepare may call Lore, but tests use fixed stdout fixtures and runtime never re-queries.
4. Add delivery metadata helper and identity-consistency tests for three nodes; leave scheduling to #197.
5. Run `bun run validate`, contract/unit tests, public/private leak audit and `git diff --check`.
6. Run the two independent read-only reviews required for benchmark contract PRs only after the
   implementation diff exists; fix findings in the same PR/change before requesting merge.

## Confirmed planning decisions

需求方已确认并在执行计划中固定：

- 实验尚未开始，Pack release 使用 `agentic-coding@0.4.0`；
- #199 提供独立 prepare adapter，按标准 Lore CLI 三步流程在隔离 Store 中执行一次 install/query/get；
- semantic query 的结果必须包含预注册 Practice ID，缺失时 preparation indeterminate；不得静默换卡；
- query/get provenance 进入 private selection sidecar，公共 trace 只保留 treatment identity/status；Practice ID、card hash 和完整 provenance 仅进入 private audit sidecar；
- source SHA、Lore content digest、injected card SHA 三者分别保存并校验；
- `kind: retrieval`、`practice-card`、`condition-scoped-private-runtime` 作为 v1 contract；
- #197/#201 的九次运行只消费 frozen snapshot，不能重新调用 Lore；
- CI 使用注入的命令 runner 和固定 stdout fixture，不调用真实 Lore、模型或网络；
- baseline/未声明 condition 无 payload，delivery failure 显式 fail closed。

如果后续需要改变 query 选择、Pack provenance、delivery isolation 或实验变量边界，必须另行
重新规划，不在本 change 中隐式扩大范围。
