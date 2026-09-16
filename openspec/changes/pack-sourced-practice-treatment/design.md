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
- 用一次选定结果生成 private runtime payload；三处 delivery 消费同一已校验 payload，
  不在运行中调用 query/get、不重排、不 fallback 到另一条 Practice。
- 让 baseline/未声明 condition fail closed；Practice card 只走
  `condition-scoped-private-runtime`，不物化到 workspace，不进入 public task/starter。
- 让 #197 能记录 `treatment_id`、`treatment_version`、`practice_id`、`practice_sha256`
  和 delivery outcome，同时在 benchmark audit sidecar 保存完整 Pack provenance。
- 以 mock/fixture 验证 identity、body consistency、applicability 和泄露边界，不依赖模型、
  网络或实时 Lore Store。

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
- canonical body SHA-256:
  `eaec0e27c85f5df6553eccf5cbcb521d2975aecfb0a3ffd0b7d754c89afa2909`

The query is a one-time selection input, not an experiment variable. It must describe the task
moment and decision boundary without naming the expected Practice ID. The selected result is then
read once, canonicalized according to the Lore `get` contract, hashed, and copied only to the
private treatment runtime/reference. If the upstream ref, ID, digest, or body hash differs, the
resolver fails closed instead of silently selecting another result.

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
  content_digest: <Lore get contentDigest>
  body_sha256: eaec0e27c85f5df6553eccf5cbcb521d2975aecfb0a3ffd0b7d754c89afa2909
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

1. Freeze the contract and schema fields after the required planning clarification.
2. Add private canonical practice/reference and immutable provenance fixture; no public materialization.
3. Implement resolver/validator with dependency-injected query/get fixture and fail-closed identity
   checks; do not make a live model/network call in tests.
4. Add delivery metadata helper and identity-consistency tests for three nodes; leave scheduling to
   #197.
5. Run `bun run validate`, contract/unit tests, public/private leak audit and `git diff --check`.
6. Run the two independent read-only reviews required for benchmark contract PRs only after the
   implementation diff exists; fix findings in the same PR/change before requesting merge.

## Decision recorded before full planning

需求方已明确一项前置方向：实验尚未开始，Pack release 固定为最新已发布的
`agentic-coding@0.4.0`，而不是 issue 创建时提名的 `0.3.0`。这只记录 release 选择，
不代表完整规划澄清已经完成。

以下 treatment kind、query sidecar 隐私边界、内容双 hash、delivery failure 语义和
baseline/三 timing node 的最终可观察口径，仍须在正式规划阶段确认后，才能勾选 tasks.md
中的 0.4 并开始非 OpenSpec 实现。
