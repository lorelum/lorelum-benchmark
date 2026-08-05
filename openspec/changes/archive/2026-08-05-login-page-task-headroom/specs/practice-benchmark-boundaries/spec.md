## ADDED Requirements

### Requirement: 候选环境不得暴露测试痕迹
The agent-visible workspace and prompt of a real-development-style candidate MUST NOT contain benchmark artifacts such as scoring, rubric, hash, condition, or evaluation wording, and the run MUST NOT ask the agent about the test environment or reveal test intent.

#### Scenario: Workspace is free of benchmark artifacts
- **WHEN** a reviewer inspects the candidate workspace and prompt from the
  agent's perspective
- **THEN** no scoring/rubric/hash/condition/evaluation wording is present and no
  prompt asks about the test

### Requirement: Practice 注入须条件化并以项目内规范呈现
Practice content MUST be delivered as a project-internal convention through the
treatment channel and MUST be condition-scoped: the baseline condition receives
no convention, the irrelevant control receives only its declared control
convention, and the oracle condition receives the layering convention. It MUST
NOT be part of the shared public starter, and public traces MUST record only
the convention version and hash.

#### Scenario: Condition-scoped convention injection
- **WHEN** a Practice is injected for the oracle condition
- **THEN** it appears as project documentation there, the baseline workspace
  contains no convention, and the irrelevant control only ever contains its own
  declared control convention (never the oracle one)

### Requirement: 真实性检测为事后被动审计
Detecting whether the agent recognized the test environment MUST be a post-hoc
passive audit by the benchmark operators reading the run trace; it MUST NOT
involve asking the agent, revealing the test, or affecting the run's score.

#### Scenario: Passive authenticity audit
- **WHEN** the run finishes
- **THEN** operators read the trace for spontaneous test/benchmark/evaluation
  language and record it as an interpretation signal without changing the run
  outcome
