## Context

#137 pilot 与 v2 重评（PR #144，已合并）确认登录页 candidate（`login-page-auth-flow-v1`）的两个有效性威胁：

1. **Ceiling（无头部空间）**：starter 已预置完整三层结构，baseline 无注入即 v2 100/100，三条件同分。
2. **Demand characteristics（环境真实感不足）**：Practice 以「练习卡」经 skill 通道注入、starter 无工程历史，agent 可能识别出测试环境并行为失真。

本 change 新建 candidate 下一 revision，同时解决两者：制造 Practice 可观测缺口，并把环境改到"从材料本身看不出在测试"。

## Goals / Non-Goals

**Goals:**

- 新建 `incubator/practice-injection/login-page-auth-flow-v2/`（不改写 v1/历史结果），独立 public/private、candidate.yaml、conditions.yaml、oracle.yaml、evaluator、calibration、snapshot.json。
- 制造缺口：starter 不预置领域翻译层（保留 `api/http.ts`，移除/降级 `api/session.ts` 的 200/401→LoginResult 翻译）；task.md 不写分层提示。baseline（无注入）v2 存在至少一个 criterion 缺口，oracle 条件能补上。
- 环境真实化：starter 带 git 历史与工程上下文；task.md 真实工单口吻；工作区/prompt 无测试痕迹（评分/hash/condition/评测字样）。
- 注入隐蔽化：Practice 以「项目内规范」（`docs/frontend-guide.md`「前端分层约定」）**条件注入**，仅 oracle 可见；公开痕迹只记录版本与 hash。
- 事后被动真实性审计：运行结束后由评测方读 trace 统计 agent 是否自发识别测试环境；不提问、不暴露、不影响评分。
- 用 v2 离线验证缺口，校准矩阵、public/private audit、snapshot、`bun run validate`、OpenSpec strict 通过。

**Non-Goals:**

- 不修改 `login-page-auth-flow-v1` 或历史 pilot 结果；不实现 runner judge provider 与 SourceMap/indeterminate 协议（#146）。
- 不执行正式 benchmark、不创建正式 record、不升级 suite revision。
- 不新增 Practice 卡内容（沿用 `react.api.layered-design`，仅改变呈现方式）。
- 不把「单题通过/条件成功」写成 Practice 有效。

## Decisions

### 新 revision 而非原地修改

v1 已有 pilot 结果，禁止改写。新建 `login-page-auth-flow-v2` 独立 candidate，拥有独立 manifest/snapshot。

### 制造缺口的 starter 设计（默认方向，规划澄清确认）

- 保留 `src/api/http.ts`（transport + DTO）作为「已给出能力」。
- 移除预置的 `src/api/session.ts` 领域翻译层（或降级为不含 200/401→LoginResult 翻译的示例），让模型自行决定错误翻译与领域操作封装位置。
- task.md 只描述产品行为（成功/失败反馈、防重复提交、禁用态），不写「接口调用和错误处理放 api 那边」——这是与 v1 的关键差异，避免题面把答案说出来。
- 语义硬门槛仍由 Playwright 测试承担；分层质量由 v2 judge + verify-layering 测量。

### Practice 注入条件化 + 去卡片化

- Practice 文本以「项目内既有规范」形态呈现（`docs/frontend-guide.md` 的「前端分层约定」小节，措辞像团队约定而非评测材料）。
- 该文档**条件注入**：仅 oracle-practice 条件经 treatment 通道注入到 agent 可见 workspace；baseline / irrelevant 不可见。不可放入共享 starter，否则缺口被抹平。
- 公开痕迹只记录规范版本与 hash（沿用 practice 注入契约）。

### 环境真实化

- starter 增加 git 历史（脚手架 → API 封装 → 测试 → 待接通登录），agent 观感为「加入已有项目」。
- 工作区/prompt 不得出现：benchmark、评测、评分、rubric、hash、condition、practice 等字样；预算/超时配置对 agent 不可见。

### 事后被动真实性审计

- 运行结束后由评测方读 trace，统计 agent 是否自发提及测试/评测/benchmark；记录为真实性指标，不干扰运行、不回传、不影响评分。
- 该审计不作为任务成败判据，只作为复测结论的解释边界。

### 验证与门禁

- 用 v2（#144 已合并）离线重评修订后 baseline/oracle 构造样例，给出 criterion 级结果表；要求 baseline 存在缺口、oracle 能补上。
- 真实性审查：reviewer 以「agent 视角」检查工作区与 prompt，确认从材料本身无法识别测试意图；本地 dry-run 检查工作区内容。
- `bun run validate`、OpenSpec strict、snapshot、`git diff --check`。

## Risks / Trade-offs

- [去掉题面提示后 baseline 缺口仍可能被模型「自然」补上] → 离线重评确认缺口存在；不足则调整 starter（如进一步移除 http.ts 或要求接入未预置新接口）。
- [规范注入仍可能被识破] → 措辞贴近团队约定 + 事后被动审计记录；结论仍按诊断定位。
- [v2 判分对修改后 starter 的适用性] → 先用 v2 校准矩阵覆盖新 starter 形态。
- [git 历史增加实现复杂度] → 历史为固定 commit 序列，snapshot 校验覆盖。

## Migration Plan

1. 创建本 OpenSpec-only PR（仅 artifacts），引用 #145，通过 strict validation。
2. 规划澄清：确认缺口方式（默认：保留 http.ts、移除 session.ts 翻译层）、规范注入形态、是否保留现成能力、修订范围（默认仅登录页）。
3. 实现 v2 candidate（public/private、starter + git 历史、conditions/oracle/evaluator、calibration、snapshot）与验证，持续提交到同一 PR。
4. 用 v2 离线重评 baseline/oracle 构造样例，跑校准矩阵、public/private audit、snapshot、`bun run validate`、OpenSpec strict，保留证据。
5. 不执行正式 benchmark、不创建 record；复测 pilot 由独立计划承接。

回滚：删除 v2 candidate 目录即可；不触碰 v1 与历史记录。

## Open Questions

- 缺口方式确认：默认「保留 http.ts、移除 session.ts 翻译层」，还是「要求接入未预置新接口」？
- 规范注入具体形态与措辞（`docs/frontend-guide.md` 小节 vs AGENTS.md 约定）。
- 是否保留 http.ts 作为「已给出能力」。
- 修订范围是否仅限登录页 candidate。

## Planning Confirmation (2026-08-05, confirmed on #145)

1. **Gap strategy**: keep `api/http.ts` (transport + DTO); remove the
   `api/session.ts` 200/401→LoginResult translation layer; `task.md` states
   product behavior only and drops the v1 layering hint 「接口调用和错误处理放 api
   那边」.
2. **Injection presentation (de-card)**: add `injection-calibration/v2` profile
   with delivery template `project-convention/v1` that writes the practice text
   into the agent workspace at `docs/frontend-guide.md` (oracle/irrelevant
   conditions only), replacing the practice-card + `--append-system-prompt`
   ("Apply this Practice…") channel; `injection-calibration/v1` stays frozen.
   The convention document MUST NOT enter the shared starter or git history.
3. **Scope**: only the login-page candidate, as a new
   `incubator/practice-injection/login-page-auth-flow-v2/` directory.
4. **Starter realism**: add 3-5 realistic git commits (scaffold → API wrapper →
   tests → pending login wiring); medium-fidelity context (keep the current app
   shell + `docs/auth-api.md`).

## Judge sharing (2026-08-05)

To avoid per-candidate duplication (the v2 judge previously lived inside each
candidate's `private/judge/v2/`, ~1357 lines per candidate), the login Practice
judge v2 is now a shared versioned helper at
`src/benchmark/judge/practice-layered-api/v2/` (score, rubric, rubric-v2.yaml,
genericized calibrate, unit tests). Candidates reference it from their
`calibration_roles` command instead of copying; `login-page-auth-flow-v1` keeps
its local copy frozen. The rubric text is byte-identical, so the rubric hash
(`3d4d719b…`) is unchanged.
