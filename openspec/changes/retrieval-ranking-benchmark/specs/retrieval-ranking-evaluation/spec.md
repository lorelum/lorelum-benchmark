# Spec Delta

## Purpose

为 Lorelum semantic retrieval 建立独立、可复现的排名评测契约，使候选召回、最终 top-k 排名和运行有效性可以分别观察，而不借用 Agent 编码任务的结果字段或结论。

## ADDED Requirements

### Requirement: Retrieval ranking runs are separate from Agent task outcomes

检索排名评测 MUST 使用独立的 track-specific suite、运行配置和批次记录语义。它 MUST NOT 伪造编码 Agent、task starter、treatment、semantic completion、quality score 或 Agent run 字段；现有 Agent 轨道和记录 MUST 保持兼容。

#### Scenario: A retrieval batch is recorded
- **WHEN** runner 完成一次检索排名评测
- **THEN** 它创建一条 retrieval batch record，而不是每个 query 一条 Agent run record

#### Scenario: Existing Agent records remain valid
- **WHEN** retrieval track-specific schema and validator are added
- **THEN** existing Agent suite manifests and run records continue to validate under their existing contracts

### Requirement: Corpus and cases are fixed and versioned

每个 retrieval benchmark revision MUST 固定完整语料来源、Pack/source revision、Practice ID 清单及其 digest，并版本化 query、gold labels 与 scorer。语料正文 MUST 从锁定来源重建，不得复制或改写到 benchmark fixtures。每个案例 MUST 声明一个或多个必需 core Practice IDs；若答案互相替代 MUST 表达为不同案例。案例 MAY 声明明确不适用于当前任务/阶段的 scope-confuser Practice IDs。

#### Scenario: The full corpus is reconstructed
- **WHEN** a benchmark revision is prepared from its pinned corpus source
- **THEN** the validator confirms the complete Practice ID inventory and content digests without requiring copied Pack bodies

#### Scenario: A case has required Practices and a scope confuser
- **WHEN** a query has multiple jointly useful core Practices and a domain-similar but task/phase-mismatched Practice
- **THEN** each required core ID and the scope-confuser ID are explicit labels, while an alternative valid answer is represented by a separate case

### Requirement: Gold labels are isolated from the system under test

Runner MUST construct harness input from an allowlist containing only the query and declared retrieval configuration. Gold labels, scorer state, and expected IDs MUST NOT be passed in harness stdin, arguments, environment variables, or other process input. Harness interaction MUST use the declared local benchmark protocol, not user CLI debug output, imports of Engine private source, or a new public product API. Successful responses MUST contain only structured status and candidate/final Practice ID lists; failures MUST NOT be treated as partial successful rankings.

#### Scenario: A query is sent for retrieval
- **WHEN** runner invokes the locked Lorelum checkout for one case
- **THEN** harness receives the query and fixed runtime configuration without any gold label or scorer field

#### Scenario: Harness reports a failed or partial attempt
- **WHEN** retrieval fails, retries, or cannot provide both lists from the same retrieval snapshot
- **THEN** runner records the case as failed and does not score or retain a partial candidate/final list as success

### Requirement: Candidate recall and final ranking are scored separately

Scorer MUST evaluate candidate inclusion using the declared candidate width N and final inclusion/rank using K. It MUST report core Practice candidate recall and final top-K hit/rank separately, including whether a core Practice was absent from candidates or present but outside final K. When both a core and an explicitly labeled scope-confuser appear in final results, scorer MUST report their relative ordering. A scope-confuser's presence in top K alone MUST NOT count as failure. Results MUST preserve raw per-case evidence and MUST NOT collapse retrieval outcomes into a weighted total or an Agent-effectiveness claim.

#### Scenario: Core Practice was not retrieved as a candidate
- **WHEN** none of a case's required core IDs appears in candidateIds
- **THEN** the case reports candidate-recall failure rather than a final-ranking failure

#### Scenario: Core Practice was a candidate but ranked too low
- **WHEN** a required core ID appears in candidateIds but not in finalIds
- **THEN** the case reports candidate recall separately from the final top-K miss

#### Scenario: Scope-confuser is visible but not ahead of core
- **WHEN** a scope-confuser appears in finalIds and every co-present core is ranked ahead of it
- **THEN** its presence is recorded for diagnosis but is not by itself a case failure

#### Scenario: Scope-confuser outranks core
- **WHEN** a scope-confuser and a core Practice both appear in finalIds but the scope-confuser ranks first
- **THEN** scorer reports the pairwise ordering inversion even if the core remains within top K

### Requirement: Batch status and retrieval outcomes are independently recorded

A complete run MUST represent one full query-set batch and MUST record the benchmark/case/label/scorer revision, corpus source and digest, Lorelum checkout commit, embedding Profile, N/K, runtime environment, and hashes for result artifacts. Batch execution status MUST be distinct from retrieval metrics. Incomplete or failed batches MUST retain failure status and MUST NOT be combined with another run to create a complete result. Re-running MUST create a new batch identity.

#### Scenario: Every case completes
- **WHEN** the runner successfully evaluates every case in the frozen revision
- **THEN** it records one complete batch with provenance and a hash-addressed per-case result artifact

#### Scenario: One or more cases fail
- **WHEN** any case fails or is missing
- **THEN** the batch is marked incomplete or failed, the failure is recorded, and results from another batch are not merged into it

#### Scenario: The benchmark is rerun
- **WHEN** the same benchmark revision and configuration are executed again
- **THEN** the runner creates a new run identity rather than overwriting the prior record
