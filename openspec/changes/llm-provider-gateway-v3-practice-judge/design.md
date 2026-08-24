## Context

Implements #182.

#178 pilot 判定 `diagnostic-only`：judge 主判据下 oracle 与 irrelevant 无差异（都 100），baseline 也有 attempt 拿满分。根因是任务无 headroom + judge rubric 对 Practice 盲。需求方确认采用方式 B：扩展 judge provider 输入，把注入的 oracle Practice 文本喂给 rubric 生成，走独立版本号（不改冻结 `generic/v2`）。Review 进一步要求把私有输入窄化为 candidate 声明 + hash 绑定，并把通过校准的 rubric 固化，避免未来漂移。

## Goals / Non-Goals

**Goals:**

- 新建 `judge-agent/practice-aware/v1`：rubric 生成输入同时包含 `task.md` 与声明绑定的 oracle Practice 文本。
- candidate 声明固定 rubric artifact 与 SHA-256；runner/calibrator 读取前验证 Practice 与 rubric 双 hash。
- baseline/oracle/irrelevant 三条件绑定同一 rubric hash；混合或缺失 hash 时 judge summary 标记 diagnostic-only。
- calibration 保留 sample state、criterion 分数与 rationale；indeterminate 保持 null score，不合成 0 分。
- 重做 v3 candidate：公开 starter 保留结构缺口，judge baseline 判别使用 semantic-pass 的 `baseline-policy-scatter` fixture。

**Non-Goals:**

- 不修改冻结 `judge-agent/generic/v1/v2` 或其他已使用共享 helper。
- 不修改 v1/v2 candidate、其 snapshot、已有 pilot 结果或 suite/treatment/record。
- 不调用 candidate 模型、不创建正式 record、不升级 suite revision；显式 opt-in 的真实 judge 校准除外。
- 不把 practice-aware judge 分数接入当前 `joint-pass-count` 决策 metric。

## Decisions

### Judge provider 与输入例外

- 新建独立目录 `src/benchmark/judge/judge-agent/practice-aware/v1/`，复用 generic/v2 的 LLM 客户端与 score 结构。
- stable `judge-agent-rubric-scoring` 保持默认 public-only；仅对 practice-aware v1 增加窄例外：读取 conditions 声明的 oracle Practice 与固定 rubric，且路径/SHA-256 必须完全匹配。
- `JudgeProvider.rubricText` 可选参数扩展为 `{ task_md, practice_text?, fixed_rubric_text? }`；未使用新字段的其他 provider 行为不变。
- runner 每次评分前验证 runtime oracle payload hash 与 candidate 声明固定 rubric hash；practice-aware provider 缺 oracle payload、rubric 缺失或 hash mismatch 时失败关闭。
- `summarizeJudge` 检测 practice-aware rubric hash 缺失或混合，并将其标记 diagnostic-only。

### 固定 rubric 与校准证据

- 用授权的真实 practice-aware rubric 生成流程生成 candidate 专属 rubric，写入 `private/calibration/`，在 conditions 中声明 SHA-256。
- 后续 runner/calibration 只使用该固定 rubric；重新生成会产生不同 hash 并失败关闭。
- calibration 输出 rubric dimensions/hash、每个 sample 的 observed/indeterminate 状态、criterion 分数、max、confidence 与 rationale；证据文件只保留脱敏后的 criterion 级证据。
- deterministic structural-dimension gate 拒绝没有任何 transport/boundary/policy/ledger/budget/provider-protocol/raw-response/delegation 维度的 rubric。

### Binding scoring anchors

The first fixed-rubric rerun showed that prose such as "policy is centralized" was too broad: a semantic-pass baseline with retry extracted but budget/idempotency/metering scattered could receive full structural credit. Practice-aware v1 therefore requires full/partial/zero anchors on every Practice-generated dimension. The model adjudicates only exhaustive per-anchor satisfied/evidence results and does not return criterion points. The provider deterministically derives points: zero for any satisfied zero anchor, at most half credit for any satisfied partial anchor, proportional partial credit from full anchors when no zero/partial anchor is satisfied, and full credit only when every full anchor is satisfied with no partial/zero anchor. Missing, duplicate, undeclared, non-exhaustive anchor output or model-supplied points is malformed and fails closed after an identical-prompt retry. This hardens the scoring contract without changing the task, starter, oracle, fixtures, thresholds, deterministic probe, or generic/v1/v2 helpers.

### v3 scaffold 与 baseline 口径

- `public/starter` 是刻意不完整的 semantic-fail scaffold：保留 transport adapter 与 API 文档，移除领域翻译、集中政策与账本边界。因此 `candidate.yaml` 的 `baseline_expectation.functional: false` 指该 starter 本身，而不是宣称完成后的 baseline attempt 必然 semantic fail。
- judge 判别力的可评分 baseline 使用 `baseline-policy-scatter`：semantic pass、practice not-observed、结构分散。public starter 只作为 indeterminate 诊断样本，不得被合成 0 分或计入通过判据。

### 决策规则

- 当前 conditions contract 继续使用 `joint-pass-count`，由 semantic 与 practice observation 派生。
- practice-aware judge 是 exploratory/diagnostic soft signal，不进入该 metric。若未来要把 judge score 作为主判据，必须另立 issue 并版本化 decision-rule contract。

### 校准矩阵

- 保留 reference/equivalent/type-based/docs-present/anti-pattern 基线与真实命名变体回归。
- judge 通过检查要求 reference/equivalent 高分且接近，anti-pattern/docs-present 低分且分离，baseline-policy-scatter observed 且低于 reference。
- 探针校准仍按 `practice-structure-probe-calibration` stable spec 执行。

## Risks / Trade-offs

- [Practice 文本进入 rubric 生成可能引入私有材料] → 只允许 conditions 声明的 oracle Practice，路径与 SHA-256 双绑定；irrelevant/baseline payload、evaluator 与 oracle verdict 永不进入。
- [rubric 漂移] → 校准通过后固定 private artifact 与 hash，未来生成物不匹配即失败关闭。
- [rubric 对结构维度判别力不足] → deterministic dimension gate + anti-pattern/docs-present/baseline 分离检查；不足则 diagnostic-only，不调整题面或阈值凑结果。
- [starter semantic fail 被误读为 baseline 结论] → 明确区分 incomplete scaffold 与 semantic-pass baseline-policy-scatter fixture；indeterminate 不产生分数。

## Migration Plan

1. 创建 issue #182、分支与 OpenSpec change；提交仅含 OpenSpec artifacts 的初始 PR。
2. 完成规划澄清并写回 #182 与本 design。
3. 实现 practice-aware provider v1、声明绑定、固定 rubric、runner hash 守卫与单元测试。
4. 重做 v3 candidate public/private 内容与 snapshot。
5. 授权生成并固定 practice-aware rubric，运行 criterion-level calibration。
6. 运行全部验证门禁并记录脱敏证据。

回滚：删除 practice-aware provider 目录与 v3 重做 diff；OpenSpec delta 未归档前不改变 stable specs。

## Planning Confirmation

2026-08-21，需求方确认全部口径：

1. **接口形态**：扩展 `JudgeProvider.rubricText` 可选参数，向后兼容。
2. **同尺子**：以 oracle Practice 文本作为唯一 rubric 生成输入，三条件共用同一 rubric hash。
3. **judge 授权**：授权对 calibration 夹具离线打分（内部 endpoint，`LORELUM_JUDGE_REAL=1` opt-in）。
4. **task.md 粒度**：最小行为声明，不预写分层/边界/集中政策细节。
5. **starter 缺口**：保留传输 adapter 与 API 文档，移除预置领域翻译/策略/账本边界。
6. **irrelevant 对照**：沿用 pagination。
7. **探针**：保留 v3 结构探针作为旁证；在当前 soft-signal contract 下，judge 分数用于判别力诊断。
8. **模型/预算**：deepseek/deepseek-v4-flash，25 分钟/attempt；本次不调用 candidate 模型。
9. **盲评边界**：维持现有 project-convention/v1 注入。
10. **决策规则**：strictly-greater-than-each-control；本次 contract 仍以 joint-pass-count 为正式 metric，judge 为独立 diagnostic soft signal，主判据升级需后续 change。
11. **starter 提交**：不可变源码提交。

## Review Resolution (2026-08-24)

- 为 stable judge capability 增加 MODIFIED public-only 要求，并同步 protocol/PI runner 文档。
- Practice 与 rubric 输入均由 conditions 声明并验证 SHA-256，任意路径或 hash mismatch fail closed。
- calibration 使用 semantic-pass 的 baseline-policy-scatter；public starter 保持 indeterminate/null，不合成 0 分。
- calibration 输出并留存脱敏 criterion 与 anchor 级证据；固定 private rubric artifact/hash 绑定未来运行。
- summarizeJudge 强制 practice-aware rubric hash 一致，混合/缺失即 diagnostic-only。
- 明确 candidate model calls 为 0；唯一模型调用例外是显式 opt-in judge calibration。
- 修正 PR/proposal traceability 与 `git diff --check origin/main...HEAD`。
