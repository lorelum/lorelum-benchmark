## ADDED Requirements

### Requirement: Evaluation assistance is scoped to research outcomes

The future JudgeAgent evaluation-assistance capability MUST activate only when the requested work includes evaluation, comparison, or scoring of a research outcome. It MUST use the confirmed research issue/OpenSpec as its initial context and MUST NOT require a Judge declaration for unrelated engineering setup, maintenance, or bug-fix work. A study MAY determine that no Judge is appropriate.

#### Scenario: Research question calls for evaluation design
- **WHEN** a confirmed study asks whether an intervention or approach changes an outcome
- **THEN** the assistant proposes a research-specific evaluation plan rather than applying a fixed task-category rubric

#### Scenario: Pure engineering work has no evaluation objective
- **WHEN** an issue only builds infrastructure or fixes a bug without evaluating a research outcome
- **THEN** the workflow does not require a Judge applicability field or evaluation plan

### Requirement: Evaluation plans match the research question and expose uncertainty

Before scoring or drafting an evaluation tool, the assistant MUST identify the decision to be evaluated, relevant evidence, evaluation unit, and conclusion boundary from the confirmed issue/OpenSpec. It MUST recommend an appropriate combination of deterministic metrics, LLM judgment, human review, or no Judge. It MUST identify missing evidence and MUST ask for clarification when an unresolved choice would materially change the primary outcome, comparison, or conclusion; it MUST NOT silently invent that choice.

#### Scenario: Deterministic evidence is sufficient
- **WHEN** a study outcome can be measured by predeclared deterministic traces or checks
- **THEN** the plan recommends those measures and does not add an LLM score solely for uniformity

#### Scenario: Evaluation intent is underspecified
- **WHEN** the issue/OpenSpec does not establish what result counts as better or what evidence is admissible
- **THEN** the assistant presents the missing decision and asks for clarification before finalizing the plan

### Requirement: Tool-code drafts require an approved plan and remain measurement-only

After a researcher approves an evaluation plan that explicitly calls for a new tool, the future JudgeAgent MAY draft evaluator or analysis code that consumes already available, approved evidence. Draft code MUST NOT change runner delivery, instrumentation, task, treatment, or environment, and MUST NOT access private Oracle/evaluator/scoring material. Missing observations MUST be reported as a gap for separately scoped work. Generated code MUST remain untrusted until human code review; any authorized smoke MUST be isolated and use public or synthetic samples only. Formal integration MUST follow its own issue/OpenSpec/PR and validation lifecycle.

#### Scenario: Approved plan needs a deterministic summary tool
- **WHEN** the approved plan names a metric that existing approved run artifacts can support but no existing tool calculates
- **THEN** the assistant may draft a reader/analysis script for those artifacts and identify its inputs and expected outputs for human review

#### Scenario: Required evidence was never collected
- **WHEN** the approved plan requires an event or observation absent from existing artifacts
- **THEN** the assistant reports the evidence gap and does not generate runner or instrumentation changes as part of the evaluator draft

#### Scenario: Draft has not passed review
- **WHEN** generated code has not received human review and approval
- **THEN** it is not run against study evidence or used to produce a reported conclusion

### Requirement: Judge scoring remains optional, blinded where needed, and separate from semantic truth

LLM judgment MUST be used only for outcomes where subjective assessment is part of the approved plan. Scoring input MUST follow `judgeagent-soft-scoring` public-only allowlist and MUST exclude private Oracle/evaluator/scoring material, private Practice payload, and real condition mapping. Where condition awareness could bias scoring, evidence MUST be blinded before scoring and condition mapping may be restored only by a deterministic post-score process. Judge output MUST remain an independent soft signal and MUST NOT change semantic completion, execution health, or formal-record facts.

#### Scenario: Judge is not part of the approved method
- **WHEN** the approved evaluation plan selects deterministic or human evaluation without an LLM Judge
- **THEN** no Judge provider is called for that outcome

#### Scenario: Blinded scoring precedes deterministic comparison
- **WHEN** a study compares conditions and approved subjective scoring could be biased by knowing the condition
- **THEN** the Judge scores blinded evidence, and any condition join occurs only after scoring through a deterministic process

#### Scenario: High Judge score accompanies semantic failure
- **WHEN** a candidate receives a high soft score but fails a semantic hard gate
- **THEN** semantic completion remains failed and the Judge result remains an independent quality signal

### Requirement: Validation is specific to the chosen evaluation method

Each study MUST validate the evaluation method it actually uses and MUST state limits on resulting claims. LLM-based subjective scoring MUST have a relevant calibration or reliability plan before directional use. Deterministic evaluators MUST be checked with cases, invariants, or negative/mutation tests appropriate to their metric. The capability MUST NOT impose one universal reference/equivalent/anti-pattern package or score threshold on studies that do not use that scoring method.

#### Scenario: Study uses an LLM quality score
- **WHEN** an approved plan uses an LLM Judge for directional quality analysis
- **THEN** the plan includes study-relevant calibration/reliability evidence and keeps private acceptance labels outside model input

#### Scenario: Study uses deterministic comparison only
- **WHEN** a study uses deterministic traces and aggregation without subjective LLM scoring
- **THEN** it validates those measures directly and is not required to create an LLM Judge calibration package

#### Scenario: Walkthrough cases differ in method
- **WHEN** the design is walked through against #200 and #192
- **THEN** it preserves #200's blinded task-specific soft Judge role and #192's deterministic no-Judge role without treating either case as a universal rubric or proof of generality

### Requirement: Plans, drafts, and results preserve versioned provenance

Future evaluation plans, approved rubrics, generated tool drafts, and resulting scores MUST be traceable to the source issue/OpenSpec revision and relevant content/version hashes. The implementation MUST NOT silently extend or reinterpret `judge-result/v1`; any additional provenance relationship MUST use an explicitly versioned artifact or schema. Existing generic providers and fixed rubrics MUST remain interpretable, and migration MUST be explicit and validated per consumer.

#### Scenario: Evaluation tool draft is revised
- **WHEN** an approved plan or generated tool changes
- **THEN** its revision and content identity can be distinguished from prior drafts and associated scoring outputs

#### Scenario: Existing result schema lacks required provenance
- **WHEN** a future implementation needs to persist research-plan or generated-tool provenance not expressible by `judge-result/v1`
- **THEN** it adds a separately versioned artifact/schema rather than silently changing v1 semantics

#### Scenario: Existing consumer considers migration
- **WHEN** a consumer currently uses `generic/v1`, `generic/v2`, or a fixed task rubric
- **THEN** it remains unchanged unless a separate, validated, versioned migration is approved
