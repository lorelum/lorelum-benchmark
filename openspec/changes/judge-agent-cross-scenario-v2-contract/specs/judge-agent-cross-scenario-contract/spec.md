## ADDED Requirements

### Requirement: Cross-scenario judgments use a public, scoped scenario descriptor

A future cross-scenario JudgeAgent facility MUST require a versioned, hashable public scenario descriptor in addition to the public task and candidate evidence. The descriptor MUST contain a stable identity/version, scenario purpose, explicitly declared observable behaviors, reviewable quality signals with concrete evidence expectations, admissible public evidence inventory, exclusions/non-goals, and an uncertainty boundary. It MUST NOT contain or reference private Oracle material, evaluator assertions, scoring thresholds, condition identifiers, Practice payloads, calibration acceptance labels, or any other material forbidden by `judgeagent-soft-scoring`.

The descriptor MUST narrow the judgment to declared signals; it MUST NOT rely on global task-type-specific prompt heuristics as an undeclared substitute for scenario context.

#### Scenario: A descriptor supplies context for a UI boundary scenario
- **WHEN** a future facility prepares a UI/service-boundary judgment
- **THEN** it provides a public descriptor that names the observable behavior and evidence expectations without passing private evaluator or quality-acceptance material

#### Scenario: Private material in a descriptor is rejected
- **WHEN** a proposed descriptor includes a private path, Oracle/evaluator assertion, condition identifier, Practice payload, or private calibration label
- **THEN** descriptor validation fails closed before any provider call or score artifact is produced

### Requirement: Rubric proposal and approved scoring rubric have distinct lifecycle states

A future facility MAY generate a rubric proposal only from the descriptor and other declared public input. A proposal MUST be bound to descriptor, input inventory, generator/version, prompt, and proposal hashes, and MUST be treated as advice rather than an authoritative score contract.

A score used for calibration admission or directional reporting MUST use an explicitly approved, versioned rubric bound to the same descriptor identity/hash. A changed descriptor, rubric content, generator/version, or prompt MUST create distinguishable provenance; the facility MUST NOT silently reuse or reinterpret an existing approved rubric. The exact approval authority and artifact location MUST be confirmed before implementation.

#### Scenario: Generated rubric is awaiting approval
- **WHEN** a model generates a structurally valid rubric proposal for a descriptor
- **THEN** the facility records it as a proposal and does not use it for directional scoring or calibration admission until an approved rubric identity exists

#### Scenario: Descriptor changes after rubric approval
- **WHEN** the descriptor content or version changes
- **THEN** the prior approved rubric is not treated as approved for the new descriptor and a new proposal/approval provenance chain is required

### Requirement: Scores are evidence-bound and preserve fail-closed quality semantics

A future cross-scenario score MUST be constructed through the existing public-only JudgeAgent input boundary using only the descriptor, declared public task/material, candidate diff or source, and approved rubric. Criterion rationales MUST cite supplied candidate evidence by file, symbol, or observable behavior, or state that the expected evidence is unavailable. The judge MUST return an existing fail-closed unavailable/indeterminate outcome rather than infer missing private acceptance knowledge or fabricate a low score.

The facility MUST preserve the `judgeagent-soft-scoring` and `benchmark-outcome-contract` rule that quality is a sidecar signal only. It MUST NOT alter semantic completion, execution health, evaluator hard gates, or the factual basis of a formal record.

#### Scenario: Candidate evidence is insufficient for a declared quality signal
- **WHEN** the declared public evidence inventory cannot establish whether a candidate satisfies a quality signal
- **THEN** the score is indeterminate or unavailable with an audit reason, rather than a guessed pass or low score

#### Scenario: High quality score accompanies semantic failure
- **WHEN** a candidate has a high cross-scenario quality score but fails a semantic hard gate
- **THEN** semantic completion remains failed and the score remains only an independent quality sidecar

### Requirement: Scenario-family calibration separates public judge inputs from private acceptance evidence

Before a scenario family is used for directional cross-scenario quality analysis, its versioned calibration package MUST contain reference, behaviorally equivalent, and anti-pattern examples and judge each one using the same descriptor/rubric and public-only input path intended for consumption. The package MUST be reviewed for discrimination, equivalence tolerance, disagreement or repeatability, and indeterminate/unavailable behavior.

Expected labels, scoring thresholds, semantic Oracle evidence, and calibration acceptance decisions MUST remain private and MUST NOT be supplied to the judge, agent workspace, public task prompt, public trace, or public report. Passing a single package MUST NOT be represented as proof of general applicability beyond its declared scenario family.

#### Scenario: Equivalent implementation does not mirror the reference layout
- **WHEN** a behaviorally equivalent example uses a materially different file layout, naming scheme, or implementation structure
- **THEN** calibration evaluates it against the declared quality signal and does not require reference-specific paths, names, or helpers

#### Scenario: Calibration material is accidentally offered as judge context
- **WHEN** a private acceptance label, threshold, Oracle statement, or calibration path is included in proposed judge input
- **THEN** the public-only input constructor rejects the attempt before a provider is called

### Requirement: Cross-scenario provenance is versioned without mutating frozen result contracts

Every future cross-scenario judgment used outside local diagnosis MUST make the descriptor identity/hash, approved-rubric identity/hash, declared public evidence inventory hash, generator/scorer identity/version, prompt hash, and input hash auditable. If `judge-result/v1` cannot represent the required relationship, the implementation MUST introduce a new versioned companion sidecar or a new schema version; it MUST NOT silently add fields or reinterpret the meaning of `judge-result/v1`.

#### Scenario: Existing judge-result/v1 cannot encode approved descriptor linkage
- **WHEN** an implementation needs to persist descriptor-approval provenance not expressible by `judge-result/v1`
- **THEN** it records the relationship in a separately versioned sidecar or adopts a confirmed new schema version while preserving existing v1 interpretation

#### Scenario: Consumer sees a score with missing cross-scenario provenance
- **WHEN** a consumer attempts to use a cross-scenario score without auditable descriptor, approved-rubric, prompt, and input provenance
- **THEN** the consumer treats it as unavailable for directional analysis and does not convert it into a quality observation

### Requirement: Cross-scenario capability admission remains bounded and experimental until validated

The first future validation plan MUST exercise at least two non-isomorphic scenario families, including a UI/service-boundary scenario and a cross-request gateway/policy scenario. For each family, it MUST show that the descriptor and approved rubric, rather than an undeclared global prompt heuristic, define the relevant quality signal and that the private calibration package can separate reference, equivalent, and anti-pattern examples under a predeclared acceptance rule.

Until a family passes its reviewed calibration and real-model variance/failure criteria, the facility MUST be classified as diagnostic or experimental for that family. Existing fixed task-specific rubrics remain valid and MUST NOT be retired solely because a cross-scenario rubric was generated.

#### Scenario: One family passes and another lacks discrimination
- **WHEN** the UI/service-boundary family passes calibration but the gateway/policy family cannot separate its anti-pattern from reference/equivalent examples
- **THEN** only the passing family may advance under its declared scope and the other remains experimental without a generalized success claim
