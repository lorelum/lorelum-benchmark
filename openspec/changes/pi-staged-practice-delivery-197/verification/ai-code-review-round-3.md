# AI code review — round 3

日期：2026-09-17
范围：`origin/main...f3f8709`（Issue #197 / PR #217）。本轮的增量重点是本地实验配置通道：`7598156`（加载 `.env` 运行配置）、`3df0adf`（自定义 gateway provider 路由 + async cleanup 时序修复）、`f3f8709`（显式 Git Bash shell + 真实 smoke 结果）。
模式：只读审查。依据根 `AGENTS.md`、`docs/CHANGE_WORKFLOW.md`、`docs/PR_REVIEW.md`、`docs/PI_RUNNER.md`、`treatments/README.md` 与本 change 的 staged-practice-delivery spec。

## 结论

**未发现必须修改的问题。** 本轮增量没有引入评测有效性、private 材料隔离、历史记录或可复现性回归；真实 smoke 的实证结果与 spec 一致。以下 3 项均为非阻断项，其中 1 项建议在正式比较前处理。

## Findings-to-rule mapping

### 1. `should-fix`：本地 smoke 的 workspace 位于仓库内，宿主 bash 并非隔离边界

- 位置：`src/benchmark/runner/pi/v2/staged/staged-practice-delivery.ts:591`（`assertRunnerOwnedPath` 要求 workspace/artifacts 是 `.run-workspaces` 的 descendant）；smoke 运行参数 `--workspace .run-workspaces/real-smoke-20260917-e2e/workspace-b`。
- 规则依据：`AGENTS.md`「Evaluators、oracle、scoring configuration belong in `private/` and must never be copied into an agent workspace or model input」；`docs/PI_RUNNER.md` 明确正式路径由 sandbox 阻止 Pi 逃逸到宿主文件系统。
- 证据：真实 smoke 中 agent 的 bash 工具以仓库根为工作目录祖先，成功 `cd /e/lorelum-benchmark` 并读取到 `incubator/.../private/candidate.yaml` 等父仓库内容，`git` 也能向上走到 lorelum-benchmark 仓库。runner 自身的 `public/` 投影（`task.md`、`stage-2/task.md`、starter）保持不变，private artifacts 与 workspace 也确为分离 root；泄漏面来自「workspace 在仓库内」而不是 delivery 逻辑。
- 影响：本地 smoke 的隔离强度低于正式容器执行；若后续把 smoke 结果当作评测有效性证据，会被误读为与正式隔离等价。本轮 smoke 只作为诊断证据，未写 record，因此当前不构成违规。
- 建议修复方向：正式比较前让本地真实执行走容器（与 `local-wsl-pi` environment 的 `sandbox.container` 一致，workspace 挂载到 `/workspace`），或至少把 smoke workspace 放到仓库外只读候选之外的临时目录，并在 workspace ownership 校验里显式区分「repo-local scratch」与「外部 smoke root」。
- 最小验证方式：一次容器内真实 smoke，断言 agent 无法读取仓库父目录、`.git`、`private/`；或在纯离线测试中断言外部 workspace root 被接受且仓库内私密路径不可达。

### 2. `defer`：shell 配置失败目前以抛错退出，不产出结构化 attempt 报告

- 位置：`src/benchmark/runner/pi/v2/staged/staged-practice-delivery-cli.ts:66`。
- 规则依据：本 change 的 fail-closed outcome contract（`invalid-plan` / `indeterminate` 结构化报告）。
- 证据：`localPiShellPath()` 在 `LORELUM_PI_SHELL_PATH` 指向不存在路径时抛错；该调用位于 `writeInvalidStagedPracticeAttempt` 处理段之后，异常直接冒泡给 CLI，不写 audit/summary/public trace。
- 影响：本地配置错误时调用方拿到的是非结构化 stderr，而不是 `invalid-plan` 报告；不影响真实执行安全性（fail closed 成立）。
- 建议修复方向：把 shell/模型配置解析纳入 CLI 既有的结构化 invalid-plan 路径。
- 最小验证方式：新增纯离线测试，断言不可用 `LORELUM_PI_SHELL_PATH` 产出 `invalid-plan` 报告且不启动 Pi。

### 3. `defer`：`configureLocalPiModelCatalog` 承担了配置目录的复合职责

- 位置：`src/benchmark/runner/pi/v2/local-pi-model-catalog.ts:106`（新增第三个 `shellPath` 参数并写入 `settings.json`）。
- 规则依据：`docs/PR_REVIEW.md` 的结构质量与 canonical 层复用要求（本轮只记录，不阻断）。
- 证据：该函数现在同时负责模型 catalog 覆盖、自定义 provider、隔离 `PI_CODING_AGENT_DIR` 与 shell 设置，函数名与职责已有偏差；`settings.json` 目前只含 `shellPath`。
- 影响：可读性与后续扩展成本，不影响行为正确性。
- 建议修复方向：如需继续扩展本机配置，重命名为「本地 Pi home 覆盖」并把 catalog/provider/settings 拆成单一职责的小函数。
- 最小验证方式：现有 `local-pi-model-catalog.test.ts` 契约测试保持不变即可覆盖重构。

## 明确无 finding 的核对项

- **Practice 材料不进入 argv**：`runtimeCard()` 只把卡片写到 `${artifacts}/private-runtime/*.md`，通过 `--append-system-prompt <file>` 传递；adapter 测试 `production adapter uses a private append-system-prompt file without putting card bytes in argv` 覆盖。真实 smoke 证据：`task_start.stdout.jsonl`、session transcript、public trace 中都不含 `.env` API key 或 card bytes。
- **public trace 脱敏**：真实 smoke 的 `delivery-trace.json` 逐项含 session id、practice id、card/source hash、Pack provenance、private 路径的字符串扫描均为 `false`。
- **hash / provenance 绑定**：`delivery-audit.jsonl` 完整记录 Pack commit `df89b8d432a01c53361a0e23df6896a772942b09`、`source_sha256`、`card_sha256`；adapter 在投递前重算 card hash，不匹配即 `StagedPracticePiError`。
- **同 session 绑定**：`ensureSession` 在每次 start/resume 比较 session id；真实 smoke 只产生一个 transcript，`session_binding=same-session`。
- **候选身份独立于 plan**：runner 重算 #196 snapshot 的文件集合与 digest，并用固定 source commit / snapshot id 交叉校验。
- **模型路由**：`3df0adf` 的 `return await` 修复了 catalog cleanup 早于 Pi 启动的竞态；`localPiModelArgument` 只重写 `deepseek/*` 逻辑 id，自定义 provider 名为 `lorelum-local`，不依赖内置 DeepSeek catalog。

## 验证范围

已执行：

- `bun test src/benchmark/runner/pi/v2/local-pi-model-catalog.test.ts src/benchmark/runner/pi/v2/staged/staged-practice-delivery.test.ts` — 31 pass / 0 fail。
- `bun run validate` — Workspace layout is valid；Snapshots are intact。
- `git diff --check` — pass。
- 真实 Pi smoke（`task_start`，attempt `real-smoke-e2e-task-start-20260917-b`）— `completed` / `delivered` / `comparable=true` / `same-session`。

未执行：`constraint_followup` 与 `first_implementation_checkpoint` 的真实 smoke、Lore query/get、正式 record、suite revision 升级、容器内执行。以上未覆盖范围不影响本轮增量结论。
