# AI code review — round 1（复审）

日期：2026-09-17
范围：`origin/main...b4038a9`，Issue #197 / PR #217；审查包含上一轮 P0 修复后的最新 runner、adapter、schema、测试和 OpenSpec diff。
模式：只读审查；依据根 `AGENTS.md`、`docs/CHANGE_WORKFLOW.md`、`docs/PI_RUNNER.md`、`docs/PR_REVIEW.md` 及本 change 的 staged-practice-delivery spec。

## 结论

**未发现必须修改的问题。上一轮 6 个 P0 must-fix 均已修复并有离线测试覆盖。**

## Findings-to-rule mapping

### 1. checkpoint marker 必须只来自 assistant response — fixed

- 原 finding：旧实现递归扫描全部 JSON 字段，冻结的 user prompt 自身包含 marker，可能在 Agent response 前错误投放。
- 规则依据：`AGENTS.md` 的时序可复现/隔离要求；Issue #197 checkpoint 只能由 Agent 实现响应确认。
- 当前证据：`src/benchmark/runner/pi/v2/staged/checkpoint-marker.ts` 仅接受 `message_start`、`message_update`、`message_end` 中 `message.role === "assistant"` 的 text content 或 assistant text delta；裸 stdout 行和 user/tool 字段不触发。`checkpoint-stop-extension.ts` 复用同一 helper。
- 验证：`checkpoint marker matching is line-exact and ignores user prompt events`、`checkpoint extension aborts on assistant text deltas`。
- 状态：已修复，无 unresolved must-fix。

### 2. checkpoint stop 必须在同 session resume 前持久化 — fixed

- 原 finding：命中 marker 后立即 kill Pi 可能丢失 checkpoint 前的 assistant transcript。
- 规则依据：`docs/PI_RUNNER.md` 的固定 session / 可复现输入要求；OpenSpec scenario “Checkpoint delivery follows the marker”。
- 当前证据：checkpoint 调用显式加载私有 extension；extension 在 assistant marker 命中时调用 `ctx.abort()`；stream runner 等待进程自然结束，并要求 assistant `message_end.stopReason === "aborted"`。controller 还要求 `checkpoint_stop_observed === true` 才允许下一次 resume。
- 验证：`production checkpoint adapter rejects a marker without a graceful persisted stop`、`production checkpoint adapter accepts a marker-bounded stream`、`checkpoint delivery requires the adapter to confirm graceful persistence`。
- 状态：已修复，无 unresolved must-fix。

### 3. candidate source/snapshot 必须独立绑定 #196 — fixed

- 原 finding：plan 可自行声明 source commit/snapshot，再生成匹配 hash，导致候选身份漂移。
- 规则依据：`AGENTS.md` 的 immutable candidate/snapshot 规则和 `docs/PI_RUNNER.md` 的 snapshot preflight gate。
- 当前证据：runner 固定比较 source commit `74962ee0c98f7775b0eb626f7b49b878035d8778` 与 snapshot id `ee588de3877ab91f2c1dfe8219bb7f9834671dd2a275531485f9d0630e0165d2`；并重算 frozen snapshot 的文件集合、每个 leaf digest 和 snapshot id，同时拒绝 candidate symlink。
- 验证：`candidate identity is anchored to the frozen #196 source and snapshot`、`candidate snapshot leaves are verified before workspace setup`。
- 状态：已修复，无 unresolved must-fix。

### 4. invalid plan 必须产生结构化 outcome — fixed

- 原 finding：parser/CLI 错误可能直接抛出，或在 direct runner 中读取 `options.plan.delivery` 前没有结构化 audit/summary。
- 规则依据：Issue #197/OpenSpec fail-closed outcome contract。
- 当前证据：CLI 将 plan file read、parse 和 preflight failure 统一写为 `invalid-plan` audit JSONL、summary、public trace；direct runner 在解析失败时同样传递正确 root。summary 包含 `ordered_events`、`session_binding: not-started`、`comparable: false`。
- 验证：`invalid plans produce a structured invalid-plan report without invoking Pi`、`CLI records malformed plan files as invalid-plan without starting Pi`。
- 状态：已修复，无 unresolved must-fix。

### 5. workspace/artifact root 必须按物理路径校验 — fixed

- 原 finding：resolve/relative 的 lexical check 可被 symlink/junction 绕过。
- 规则依据：`AGENTS.md` public/private ownership；`docs/PI_RUNNER.md` 的隔离 workspace 要求。
- 当前证据：`physicalPath()` 解析现有祖先的 realpath 并拒绝路径链上的 symlink/junction；workspace 与 private artifacts 均要求是 runner-owned `.run-workspaces` 的真实 descendant，且彼此非嵌套。
- 验证：`physical workspace and artifact boundaries reject symlink aliases`、`artifact ownership rejects frozen input paths before any write`。
- 状态：已修复，无 unresolved must-fix。

### 6. runner 不得递归删除 caller-controlled workspace — fixed

- 原 finding：setup 直接递归删除 `--workspace`，可能删除 checkout/candidate/treatment。
- 规则依据：`AGENTS.md` 禁止破坏冻结输入；`docs/PI_RUNNER.md` 要求 adapter 自建隔离 workspace。
- 当前证据：setup 不再调用 recursive remove；workspace 必须是 runner-owned scratch descendant 且预先为空，否则 fail closed。artifact ownership 同样拒绝 candidate/treatment/repository 路径。
- 验证：`workspace setup never deletes a caller-provided non-empty workspace`、`artifact ownership rejects frozen input paths before any write`。
- 状态：已修复，无 unresolved must-fix。

## Non-blocking / deferred

- runner plan 继续记录 model version、tool policy、environment 和 max turns，但本 delivery-only adapter 只直接执行 plan model 与 per-call duration；这是初始 review 已明确的 deferred residual risk。正式模型比较前必须由独立 Issue/OpenSpec change 绑定实际 environment/runtime policy，本 change 不隐式扩大范围。

## 验证范围

通过：

- `bun test src/benchmark/runner/pi/v2/staged` — 41 pass。
- `bun test src/benchmark/treatments/pack-practice/v1` — 19 pass。
- `bun run test:contracts:runner` — 135 pass。
- `bun run validate` — Workspace layout is valid；Snapshots are intact。
- `openspec validate pi-staged-practice-delivery-197 --type change --strict --json` — valid。
- `git diff --check` — pass。

未执行：真实 Pi、Lore query/get、外部网络、模型 API、正式 record、suite revision upgrade；本 change 仅使用 deterministic mock/fixture。
