## ADDED Requirements

### Requirement: 新 candidate revision 制造 Practice 可观测缺口
The next login-page candidate revision MUST NOT pre-supply the domain translation
layer: the starter SHALL keep the transport adapter (`api/http.ts`) but MUST NOT
pre-load a 200/401→LoginResult boundary, and the task statement MUST NOT include
layering hints such as 「接口调用和错误处理放 api 那边」. With no injection, the
baseline MUST show at least one missing Practice criterion under the v2 judge
(score < 100 or practice_observation=not-observed), and the oracle/injected
condition MUST be able to close that gap.

#### Scenario: Baseline has a Practice gap
- **WHEN** the baseline candidate (no injection) completes the revised task
- **THEN** the v2 judge records at least one criterion gap and the semantic hard
  gate still passes

#### Scenario: Injection closes the gap
- **WHEN** the oracle condition receives the project-internal layering guideline
  and completes the same task
- **THEN** the v2 judge records the missing criterion as satisfied

### Requirement: 环境不暴露测试痕迹
The candidate workspace and prompt MUST NOT reveal that the run is a benchmark:
no scoring, rubric, hash, condition, or evaluation wording SHALL appear in
`public/` or agent-visible material, and the run MUST NOT ask the agent about the
test or reveal test intent at any point.

#### Scenario: Agent sees only real work
- **WHEN** an agent inspects the workspace and prompt of the revised candidate
- **THEN** it sees a normal project (task as a work order, starter with git
  history and engineering context) with no benchmark artifacts

### Requirement: Practice 注入以项目内规范条件呈现
The Practice MUST be delivered as a project-internal convention (for example a
「前端分层约定」section in `docs/frontend-guide.md`) and MUST be condition-scoped:
only the oracle-practice condition receives it through the treatment channel;
baseline and irrelevant conditions MUST NOT see it, and it MUST NOT be part of the
shared starter. Public traces MUST record only the convention version and hash.

#### Scenario: Oracle sees project documentation
- **WHEN** the oracle condition runs
- **THEN** the layering guideline is available in the workspace as project
  documentation, and baseline/irrelevant runs do not contain it

### Requirement: 真实性检测为事后被动审计
Detection of whether the agent recognized the test environment MUST be a
post-hoc, passive audit performed by the benchmark operators reading the run
trace after completion. The run MUST NOT ask the agent about the environment,
and the audit result MUST NOT be communicated back to the agent or affect the
run's score.

#### Scenario: Agent self-identifies the environment
- **WHEN** the trace shows the agent spontaneously mentions test/benchmark/
  evaluation language
- **THEN** the operators record it as an authenticity signal for interpreting
  the pilot conclusion, without changing the run outcome

### Requirement: 复测前置门禁
Before any re-test pilot selects the revised candidate, the v2 judge MUST
re-score offline constructed baseline/oracle samples and produce a
criterion-level table showing the baseline gap; candidate calibration, a
public/private leak audit, snapshot verification, `bun run validate`, and
OpenSpec strict validation MUST all pass.

#### Scenario: Gate blocks a gap-less candidate
- **WHEN** offline re-scoring shows the baseline has no Practice gap
- **THEN** the candidate is not approved for the re-test pilot and the starter
  must be adjusted
