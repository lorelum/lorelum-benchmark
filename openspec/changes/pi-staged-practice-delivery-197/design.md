## Context

Issue #197 implements the delivery layer for P1's async-report timing experiment. #196 has already
frozen the public candidate and the public two-round session script; #199 has already frozen the
Pack-sourced `practice-card` treatment `agentic-coding-replan-on-material-drift/v1` and its Pack,
Practice, source, content, and card hashes. #197 must consume those frozen inputs, not perform Lore
query/get or change the candidate, task, treatment body, evaluator, JudgeAgent, or experiment result.

The runner needs to distinguish three delivery nodes in one long Agent session:
`task_start`, `constraint_followup`, and `first_implementation_checkpoint`. Each timing condition is
one separate attempt and receives the same Practice card exactly once at its assigned node. A
`baseline` path is supported only as a no-payload isolation control; it is not a fourth timing node.

## Confirmed planning decisions

The planning clarification is recorded in Issue #197 and fixes the following implementation choices:

- `task_start`, `constraint_followup`, and `first_implementation_checkpoint` are the only formal
  timing conditions. Each attempt has exactly one delivery node and exactly one possible card
  delivery; baseline has no Practice payload.
- `constraint_followup` reuses #196's `public/stage-2/task.md` through the existing session
  continuation path. No new structured user-event format is introduced.
- `first_implementation_checkpoint` reuses the exact public marker
  `CHECKPOINT: compatibility-slice-ready`. The Pi adapter streams the response, stops at the
  marker, then injects before the next same-session resume. It does not use a file, turn count,
  intent heuristic, or wall-clock delay, and it does not alter the frozen task text.
- The implementation adds a dedicated `staged-practice-delivery/v1` module and composes the
  existing Pi `start/resume` transport. It does not rewrite the historical two-stage diagnostic
  helper.
- The runner reuses `src/benchmark/treatments/pack-practice/v1/` for frozen treatment validation;
  it never reads private treatment files directly and never invokes Lore during delivery.
- A private plan hash binds candidate/source/snapshot, model, prompts, budget, tool policy, and
  environment. The runner must reject a missing or drifted binding before session start.
- Each node produces one private JSONL audit event and the attempt ends with a private summary.
  Public trace exposes only node, condition, treatment version, delivery status, and session-binding
  state; the real session id and Practice/Pack identity stay private.
- Any unconfirmed or failed node stops the attempt and marks it non-comparable; no later fallback
  delivery is allowed.

## Goals / Non-Goals

**Goals:**

- Validate and execute the three-node timing contract with one fixed card delivery per timing attempt.
- Preserve one session id across start, follow-up, checkpoint stop, and resume.
- Keep treatment content in the condition-scoped private runtime only.
- Produce auditable private provenance and strictly redacted public trace.
- Verify the complete contract with deterministic mocks and fixtures only.

**Non-Goals:**

- No natural-language query, ranking, automatic trigger recognition, file-signal detection,
  intent detection, cooldown policy, production Trigger Orchestrator, or cross-host support.
- No changes to #196 candidate/public inputs, #199 treatment content, #202 evaluator, #200 JudgeAgent,
  #201 exploration schedule, suite revisions, formal records, or model conclusions.
- No new prompt wrapper or public-task edit. The checkpoint marker remains the frozen #196 marker.

## Decisions

### 1. A delivery node is a condition-level assignment

The plan declares one `delivery_node` per timing condition. The controller runs the common session
script and delivers the card only at that assigned boundary. This preserves the experimental variable:
all other inputs and behavior are shared, while the card's one delivery point changes.

Delivering the card at all three nodes in one attempt would confound timing with repeated exposure and
would no longer be a timing-only comparison, so it is explicitly rejected.

### 2. Existing Pi start/resume is the session transport

The controller calls the existing Pi v2 adapter once for start and uses the same session id for
continuations. `constraint_followup` resumes with the frozen stage-2 prompt. For the checkpoint
condition, the adapter loads the versioned checkpoint-stop extension only for the boundary call. The
extension watches assistant text updates, requests a graceful Pi abort when the exact marker appears,
and the adapter waits for an assistant `message_end` with `stopReason: aborted` so Pi persists the
partial assistant message before the next same-session resume carries the private card. A new
long-lived stdin protocol is unnecessary, and a new session is invalid.

### 3. Treatment validation is delegated to the #199 contract

The controller receives a preloaded `PreparedPackPractice` from the existing pack-practice/v1
contract and checks the private timing plan's identity binding before execution. `deliverPreparedPractice`
remains the condition-scoped gate: treatment conditions receive a payload, baseline/undeclared
conditions receive `not-declared`, and payload/hash failures return explicit failure states.

### 4. Audit output is split by visibility

The private audit event contains actual session id, node acknowledgement, fixed Pack provenance,
Practice identity, body hash, and outcome. The public event contains only the allowlisted execution
fields. No private event is copied into the Agent workspace or stdout, and no Practice body is
materialized as a file.

### 5. Fail closed at the first unverifiable boundary

A missing marker, unsupported node, payload drift, resume mismatch, delivery error, or isolation
violation terminates the attempt. Invalid plans are recorded as `invalid-plan` without starting Pi.
The controller records the reason and preserves prior events, but never silently moves delivery to a
later/earlier node or claims successful treatment exposure.

Workspace setup is non-destructive: the caller must provide an empty descendant of the
runner-owned `.run-workspaces/` root. Root separation is checked against physical paths so symlink
and junction aliases cannot route private runtime files into the Agent workspace.

## Risks / Trade-offs

- **[Risk] Pi output continues after the checkpoint marker or the partial turn is not persisted.** →
  Use the versioned assistant-only stop extension, require graceful abort/message persistence, and
  resume only after the persisted checkpoint boundary is observed.
- **[Risk] A treatment resolver accidentally exposes private identity.** → Keep the resolver payload
  and audit sidecar private; serialize public trace through an allowlist and test forbidden markers.
- **[Risk] A runtime plan drifts from the frozen experiment inputs.** → Hash-bind candidate snapshot,
  prompts, execution settings, and environment in preflight; reject mismatches before `start`.
- **[Risk] Partial delivery leaves an ambiguous attempt.** → Stop on the first failure and report
  `failed`, `unsupported`, or `indeterminate`; do not complete a partial timing run.

## Migration Plan

1. Keep implementation on the existing `codex/pi-staged-practice-delivery-197` branch and PR #217.
2. Add the contract/types and dedicated runner module without changing historical staged helpers.
3. Run focused offline tests, `bun run validate`, `git diff --check`, and the public/private audit.
4. Record review evidence in this change. Do not run Pi/Lore/model calls or create formal records.
5. If a future experiment changes treatment, prompts, model, budget, environment, or timing semantics,
   create a new versioned change instead of mutating this contract.

## Open Questions

无。节点语义、输送方式、一次性投放、condition matrix、冻结输入、审计形状和失败收口均已确认。