## Context

#132/#133/#134/#135/#136 已全部合入 main：登录页 candidate
`login-page-auth-flow-v1` 的 `private/conditions.yaml` 已声明三条件
（baseline / oracle-practice / irrelevant-practice）与 decision_rule
（joint-pass-count，oracle 严格高于每个 control，否则 diagnostic-only）；
`private/judge/` 已有版本化登录页 rubric（四维 30/30/20/20）、确定性评分器与
校准矩阵；仓库级 `judge-result/v1` sidecar 契约、runner preflight 与
`test:pi:v2` 就绪。#75 为旧 candidate 提供了 `run-local.ts` 本地执行器模式
（干净 workspace、Practice 运行时注入、语义 evaluator、scratch 输出、信号汇总）。

Issue #137 要求在该 candidate 上执行一次受控三条件诊断 pilot，并把功能通过、
judge 分数和执行健康分开记录；结果只写入 ignored scratch，不创建正式 record。

## Goals / Non-Goals

**Goals:**

- 固定版本化执行计划：source commit、snapshot、rubric hash、profile hash、
  模型标识、提示 hash、预算与重复次数，全部在运行前冻结。
- 三个条件使用相同重复次数与干净 workspace；仅 `public/task.md` +
  `public/starter/` 进入工作区，Practice 走运行时注入。
- 先通过 runner/evaluator preflight 与 JudgeAgent preflight，再执行模型与评分。
- 每次尝试输出：语义结果、judge raw dimensions（`judge-result/v1` sidecar）、
  执行失败类别、runner/模型身份与 SHA-256 绑定。
- 输出脱敏 summary 到 ignored scratch；只报告该 candidate 的诊断性/不确定结果。
- 通过 plan dry-run、public/private audit、`bun run test:pi:v2`、
  `bun run validate`、OpenSpec strict validation 与 `git diff --check`。

**Non-Goals:**

- 不修改已有运行计划或历史结果；不创建正式 suite revision、正式 record 或发布
  报告；不归档/合并 #125。
- 不做跨 candidate、因果、产品效果或 #92 结论。
- 不修改仓库级 runner、schema 与 `judge-result/v1`；既有 stable spec 的修订见
  「实验设计修正（2026-08-06）」小节。
- 不在未通过 preflight 与 review 前执行模型调用。

## Decisions

### 三条件诊断 pilot 与重复次数（待规划确认）

执行 baseline / oracle-practice / irrelevant-practice 三条件，重复次数默认取
`conditions.yaml` 的 `repetitions`（当前 2），可用 `--repeat N` 覆盖。三组使用
相同 public starter、模型标识、Pi 命令、任务提示、工具列表与预算；唯一预期差异
是 Oracle/无关 Practice 的运行时注入。`lorelum-retrieval` 保持 unavailable。
重复次数由需求方确认后冻结（见 Open Questions）。

### Candidate 私有执行器

pilot 执行器位于 `private/execution/run-local.ts`（新 candidate，扩展 #75 模式），
不改动共享 Pi runner。每次尝试在 `scratch/` 创建干净目录，只复制 `public/task.md`
与 `public/starter/`；Pi 以非交互、无 session、无 context、无自动 skill 模式运行，
Practice 文本仅作为对应条件的追加系统提示传递，绝不写入工作区。

### 语义 + JudgeAgent 逐次评测

Pi 退出后：先运行现有语义 evaluator（`private/evaluator/evaluate.ts`），再运行
JudgeAgent（登录页 rubric `private/judge/score.ts` + 聚合策略），输出
`judge-result/v1` sidecar（judge id/version、prompt/rubric/input hash、维度分数、
理由、confidence）。judge 评分重复策略沿用 #136 的 rubric（n=3 取中位数），是否
每次尝试都按 n=3 执行由需求方确认。judge 只产生软信号，不改任务完成。

### 执行计划冻结与身份绑定

运行前冻结并校验：candidate `source_commit`、`private/snapshot.json`、
`private/judge/rubric-v1.yaml` hash、profile hash、`conditions.yaml` 的模型/提示/
预算/重复次数。summary 与每次尝试记录 runner/模型身份、Pi 版本、各类 SHA-256，
保证结果可追溯。

### Preflight 门禁

执行模型前必须通过：plan dry-run（校验 snapshot、conditions、workspace 边界，
不调用模型）、public/private audit（工作区不含 private/oracle/Practice）、
runner/evaluator preflight（`pi --version`、模型可达性、`test:pi:v2`）、
JudgeAgent preflight（rubric 校验 + mock/真实 provider 可用性）。任一失败即停止，
不执行模型调用。

### 失败分类与 scratch 输出

每次尝试记录执行失败类别（pi 启动失败 / pi 超时 / pi 非零退出 / evaluator 失败 /
judge unavailable），失败不得伪装成低质量分。全部输出（pi 日志、evaluator 输出、
judge sidecar、candidate diff、summary.json）写入 ignored `scratch/`，不创建
`results/records/`、artifact index 或外部存储对象。

### 结论口径

按 `decision_rule`（joint-pass-count，oracle 严格高于 baseline 与
irrelevant-practice）输出 signal / no-obvious-signal；健康样本不足或 judge
不可用时只报告 diagnostic/uncertain，不升级结论。judge 分数与执行健康独立记录，
不作加权总分。

### v2 复测（#145/#146/#148 合并后）

v1 pilot（v5/v6）在 `login-page-auth-flow-v1` 上跑出 no-obvious-signal，暴露两个
叠加问题：v1 starter 已预置完整三层结构（无 headroom，天花板效应），且 judge 通道
用的是 v1 本地 mock 判分器。复测改用已合入 main 的优化栈：

- **目标候选**：`login-page-auth-flow-v2`（#145：starter 去掉 session.ts、任务题面
  无分层提示，制造 Practice 可观测缺口；Practice 以 project-convention/v1 形式按
  条件注入 `docs/frontend-guide.md`，基线 workspace 不含该文档）。
- **执行器**：共享诊断 runner（`src/benchmark/runner/pi/v2/profile-diagnostic-runner.ts`，
  含 #148 合入的 judge provider 接线），不再使用 v1 私有 `run-local.ts`。
- **judge 通道**：候选声明的 `practice-layered-api/v2` provider（确定性本地 AST
  判分、不调用模型），逐 attempt 写 `judge.sidecar.json`；summary 含脱敏
  rubric_hash / criterion 级字段与 indeterminate 预算门禁（预算 0.25，超预算 →
  diagnostic_only，保留在分母）。
- **冻结计划（已执行）**：`incubator/practice-injection-plans/login-page-auth-flow-v2-three-condition-retest.yaml`
  （`profile-diagnostic-plan/v2`，id `login-page-auth-flow-v2-three-condition-retest-v2`；
  `repetitions: 6` 为 cyclic-latin-square 块数，每块覆盖三条件各一次 → 每条件 6 次、
  共 18 attempts；身份绑定 v2 snapshot/profile hash；模型 deepseek-v4-pro 与
  10min/次预算取自 v2 conditions.yaml）。2026-08-06 修正版验证跑即使用该计划。
- **成本缩减变体（未执行）**：`incubator/practice-injection-plans/login-page-auth-flow-v2-three-condition-retest-v3.yaml`
  （id `login-page-auth-flow-v2-three-condition-retest-v3`，`repetitions: 3` → 每条件
  3 次、共 9 attempts）；需求方 2026-08-06 决定后续执行按此，尚未运行。
- **v1 处理**：v1 已有 v5/v6 记录，保持冻结；本分支把 v1 恢复到 main 提交态，
  移除分支私有执行器（历史保留在提交记录中）。
- **结果口径**：按 decision_rule（joint-pass-count，oracle 严格高于 baseline 与
  irrelevant-practice）输出 signal / no-obvious-signal；健康样本不足或 indeterminate
  超预算 → diagnostic/uncertain；只写 ignored scratch，不创建正式 record。

#### v2 复测结果（2026-08-05，`scratch/profile-diagnostics/login-v2-three-condition-retest`）

- 18 attempts（每条件 6），`interrupted=false`；judge 全部 observed（rubric_hash
  `3d4d719b89dcd83f…` = v2 rubric），indeterminate_rate=0，无 diagnostic_only。
- baseline：4/6 evaluated，joint_pass 0，judge 全 0；2 次执行失败（1× Pi 超时、
  1× evaluator 非零退出）。oracle-practice：6/6 evaluated，joint_pass 2，judge
  100×2 / 0×4。irrelevant-practice：6/6 evaluated，joint_pass 0，judge 全 0。
- decision_rule（joint-pass-count，oracle 严格高于每个 control）：oracle 2 > baseline 0
  且 2 > irrelevant 0 → 方向性信号；但 `overall_conclusion_grade = diagnostic-only`
  （单候选 + baseline 健康样本不足，不满足 reproducible-direction）。
- 与 v1 pilot（v5/v6）对比：v2 judge 通道现在能区分——baseline/irrelevant 未实现
  分层 → judge 0，oracle 出现 2 次完整分层 → judge 100（v1 时三条件全部 90+ 无区分）。
  无正式 record / suite revision。

### 实验设计修正（2026-08-06，需求方确认）

第一轮 v2 复测（2026-08-05，task 无分层提示）测的是「不提示 agent 是否会自己分层」：
baseline judge 全 0、oracle 100×2/0×4，双峰结果证实了 headroom 缺口存在，但不是需求方要测的问题。

需求方确认的修正口径：**task 必须告知 agent 分层要求（恢复 v1 式提示，真实口吻），
pilot 测量的是「注入 practice 后，分层代码规范度是否提升」**，预期 oracle > baseline ≈
irrelevant（对照），而非「是否分层」的 0/1。

对应改动：
- v2 `public/task.md` 改为真实工单口吻：现状一句 + 「docs 里有接口说明」「前端已封装请求」
  （不点名文件）+ 分层要求（接口调用和错误处理放 api 那边，组件里别堆太多逻辑）+ 跑测试；
  功能行为（成功/失败/禁重复提交）不写出，由 starter 测试兜底。
- 第一轮运行（`scratch/profile-diagnostics/login-v2-three-condition-retest`）标注为
  **headroom 验证跑**（task 无分层提示）：证实基线存在 Practice 缺口、oracle 可闭合，
  不作为正式复测结论。
- **#145 stable spec 修订（并入本 PR）**：`openspec/specs/login-page-task-headroom/spec.md`
  的「task 不得含分层提示」条款已修订为「task 须给出被测行为的基本要求（基线预期可产出），
  细化约定由 Practice 提供」；`openspec/specs/practice-benchmark-boundaries/spec.md` 新增
  「任务须声明被测 Practice 基本行为要求 + 评分公平性（低分须可解释）」requirement。
  需求方 2026-08-06 决定：这两条 stable spec 修改直接并入本 PR（#143），不另建 issue/change。
- 第二轮复测（2026-08-06）：plan `login-page-auth-flow-v2-three-condition-retest-v2`
  （candidate source_commit `f10d672`、snapshot `1519423…`，repetitions=6 块 = 每条件
  6 次）；judge 通道、indeterminate 预算 0.25、模型 deepseek-v4-pro 不变。后续成本
  缩减变体 `...-v3`（repetitions=3）未执行。
- **版本归因**：v2 早期 headroom 验证跑（2026-08-05，task 无分层提示）绑定
  source_commit `24c99b1` / snapshot `809b16…`，为历史证据；当前 v2 状态（task 含
  分层提示）绑定 `f10d672` / snapshot `1519423…`，修正版结果为当前状态。两套结果按
  各自 plan/snapshot 归因，不混淆「v2 结果」。
- **F5 说明（conditions.yaml source_commit 残留）**：`private/conditions.yaml` 的
  `source_commit` 字段为历史残留（runner 身份绑定使用 candidate.yaml，不读该字段）；
  为保持已执行验证跑的 snapshot 绑定（`1519423…`）不变，未改动该字段；移除留待后续
  candidate 修订。

#### v2 复测（修正版）结果（2026-08-06，`scratch/profile-diagnostics/login-v2-three-condition-retest-v2`）

- 已执行验证跑：18 attempts（每条件 6，plan `login-page-auth-flow-v2-three-condition-retest-v2`、
  repetitions=6），`interrupted=false`；judge 全部 observed（rubric_hash `3d4d719b…`），
  indeterminate_rate=0。成本缩减变体 `...-v3`（repetitions=3）未执行。
- joint_pass / judge 分：
  - baseline：1/5（20%）/ [0,45,0,100,0]（1 次 Pi 超时）。
  - oracle-practice：3/5（60%）/ [100,100,100,0,0]（1 次 evaluator-cleanup 失败）。
  - irrelevant-practice：2/6（33%）/ [0,45,0,100,100,45]。
- decision_rule（joint-pass-count，oracle 严格高于每个 control）：oracle 3 > baseline 1
  且 3 > irrelevant 2 → **方向性信号**；但 `overall_conclusion_grade = diagnostic-only`
  （单候选 + baseline/oracle 健康样本不足 + 样本小/方差大）。
- 解读：task 含分层要求时 baseline 也会偶尔分层（1/5 满分、1/5 部分）；oracle 注入
  分层约定后满分率升到 3/5（judge 中位数 100 vs baseline 0）；irrelevant 对照 2/6
  偏高、噪声大。oracle 有 2/5 未遵循注入约定（文档在但被忽略，代码直接在组件内解析
  status/body）——practice 提升分层规范度但遵循不稳定。
- 与 headroom 验证跑（2026-08-05，task 无提示）对比：无提示 baseline 全 0、oracle
  2/6；有提示后 baseline 1/5 满分、oracle 3/5 满分——task 提示与 practice 叠加提升
  遵循率。

## Risks / Trade-offs

- [本机 Pi/模型凭据缺失] → dry-run 与 preflight 通过即可冻结计划；实际运行明确
  失败并待配置后复跑，不伪装结果。
- [重复次数少导致偶然波动] → 只报告原始次数与方向性信号，不作有效性/泛化结论。
- [条件泄露] → 干净 workspace + 运行时注入 + public/private audit；Practice/
  oracle 绝不写入工作区。
- [judge 与语义混淆] → judge 只作软信号，语义为唯一完成信号；失败类别独立记录。
- [本地工作区不等同正式 sandbox] → 执行器只 materialize public 输入，结果不得
  作为正式 benchmark 证据。

## Migration Plan

1. 创建本 OpenSpec-only PR（仅 artifacts），引用 #137，通过 strict validation。
2. 规划澄清：确认重复次数、judge 评分重复策略、pilot 是否只使用本地 provider；
   答案写回本 design（不回写 issue 评论，除非需求方要求）。
3. 实现执行器、dry-run 与 preflight、JudgeAgent 集成与聚焦测试，更新 candidate
   snapshot（如涉及）。
4. 运行 plan dry-run、public/private audit、JudgeAgent preflight、
   `bun run test:pi:v2`、`bun run validate`、OpenSpec strict validation、
   `git diff --check`，保留证据。
5. preflight 全绿且 review 通过后，执行三条件 pilot 到 ignored scratch；只读取
   脱敏 summary，不创建正式 record/suite revision。

回滚：删除新执行器与 scratch 产物即可；不触碰 `src/benchmark/`、既有 candidate
结果或正式 record。

## Open Questions

- 重复次数：沿用 `conditions.yaml` 的 2，还是改为其他值（如 3）？
- judge 评分重复策略：每次尝试按 #136 rubric 的 n=3 取中位数，还是单次？
- pilot 是否只使用本地 provider：JudgeAgent 用确定性 mock，还是真实模型 provider？
  （Pi 模型调用本身是真实的；此问题只针对 judge 评分通道。）

## Resolved Questions

- 重复次数：确认每组 2 次（沿用 `conditions.yaml` 的 repetitions=2），可用
  `--repeat` 覆盖。
- judge 评分重复策略：每次尝试按 #136 rubric 的 n=3 取中位数（本地 mock 评分器，
  确定性可复现）。
- judge 通道：pilot 只使用本地 provider（确定性 mock 评分器）；Pi 模型调用本身
  为真实（deepseek-v4-pro），但 judge 评分不调用外部模型。
- 模型选择：需求方于 2026-08-05 确认将 pilot 模型从 `deepseek-v4-pro` 切换为
  `deepseek-v4-flash`（v6 重跑；原因：v4-pro 每轮 reasoning 生成量大、单次尝试
  100–300s，flash 为同 provider 的快速档；记录于 issue #137 评论）。

## Planning Confirmation

Requirements owner confirmed through plan-mode questions (no issue comment on
#137): 每组 2 次重复；judge 每次尝试 n=3 取中位数（本地 mock）；pilot 的 judge
通道只用本地 provider；执行真实 pilot 前需独立审查门禁（pass-or-fix，参照 #136）；
规划确认不回写 issue #137，只写回本 design。实现按 tasks.md 顺序推进并持续提交
到 PR #143。
