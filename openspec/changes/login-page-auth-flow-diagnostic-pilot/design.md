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
- 不修改仓库级 runner、schema、`judge-result/v1` 或既有 stable spec。
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

（规划澄清后填写）

## Planning Confirmation

（规划澄清后填写；不回写 issue #137 评论，除非需求方要求。）
