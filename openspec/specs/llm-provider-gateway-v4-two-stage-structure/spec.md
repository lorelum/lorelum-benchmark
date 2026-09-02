# llm-provider-gateway-v4-two-stage-structure Specification

## Purpose
TBD - created by archiving change llm-provider-gateway-v4-two-stage-structure. Update Purpose after archive.
## Requirements
### Requirement: v4 is an independent candidate

`llm-provider-gateway-v4` MUST live under `incubator/practice-injection/llm-provider-gateway-v4/` with independent candidate id, source commit, public starter, snapshot, profile, conditions, evaluator, and calibration identity. The v4 implementation MUST NOT modify v1, v2, or v3 candidates, their snapshots, historical pilot evidence, frozen suite revisions, treatments, environments, records, or shared judge contracts.

#### Scenario: Protected paths remain unchanged

- **WHEN** the final v4 diff is audited
- **THEN** it contains no changes to v1/v2/v3 candidate materials, frozen revisions, historical records, or `judge-agent` helper versions

#### Scenario: Candidate identity is complete

- **WHEN** the v4 candidate is validated
- **THEN** its id, source commit, snapshot, profile, conditions, evaluator, and calibration sets resolve independently and fail closed on identity mismatch

### Requirement: Stage 1 defines only the initial behavior

Stage 1 public input MUST describe a self-contained initial implementation with chat, retry, and basic usage/billing behavior for one provider. It MUST NOT mention the Stage 2 provider, maintenance request, future architecture check, evaluator dimensions, or scoring rules. Public tests MUST verify observable behavior without exposing the intended structure.

#### Scenario: Initial request has no forward leak

- **WHEN** Stage 1 prompt, starter, public docs, and public tests are audited
- **THEN** none contains the Stage 2 provider identity, maintenance request, structural check names, scoring logic, private oracle, or credential material

### Requirement: Stage 2 is a scoped maintenance change

Stage 2 public input MUST require adding a provider with a different wire protocol while preserving the existing public API, usage semantics, and accounting semantics. It MUST NOT request a wholesale rewrite, reveal the evaluator's expected layout, or expose private oracle or fixture labels. Stage 2 MUST be materialized only after Stage 1 passes its semantic gate and snapshot check.

#### Scenario: Maintenance prompt is staged

- **WHEN** Stage 1 is running
- **THEN** the Stage 2 prompt is not present in the agent workspace

#### Scenario: Maintenance request preserves behavior

- **WHEN** Stage 2 is evaluated
- **THEN** the original public behavior remains valid in addition to the newly requested provider behavior

### Requirement: Three Practice conditions remain isolated and balanced

The candidate MUST declare baseline, oracle-practice, and irrelevant-practice conditions. Baseline MUST NOT receive a Practice document. Oracle and irrelevant conditions MUST use condition-scoped `project-convention/v1` delivery, verified paths and SHA-256 hashes, and length-balanced texts. The irrelevant Practice MUST NOT encode gateway structure, Stage 2 behavior, evaluator labels, or scoring logic. Public trace material MAY record only declared identifiers, versions, delivery metadata, target path, and hashes.

#### Scenario: Baseline has no Practice material

- **WHEN** a baseline attempt workspace is inspected
- **THEN** no oracle or irrelevant Practice document is present

#### Scenario: Practice hash and length are verified

- **WHEN** the profile resolves oracle-practice and irrelevant-practice
- **THEN** both cards match their declared SHA-256 hashes, use `project-convention/v1`, and satisfy the declared length-balance limit

#### Scenario: Practice text does not leak Stage 2

- **WHEN** oracle and irrelevant Practice texts are audited against the Stage 2 prompt and evaluator concepts
- **THEN** neither contains the Stage 2 provider identity, maintenance request, expected structure labels, evaluator logic, oracle material, or scoring configuration

### Requirement: Semantic acceptance and structure observation remain separate

Private Stage 1 and Stage 2 semantic evaluators MUST verify public behavior and remain the only task-completion gates. The deterministic structure result MUST remain an independent research observation and MUST NOT change semantic pass/fail, execution health, or historical outcome semantics. A structural failure with passing semantics remains a research failure, not an execution failure.

#### Scenario: Structure does not rewrite semantics

- **WHEN** Stage 1 and Stage 2 semantic checks pass but one structural check fails
- **THEN** semantic completion remains pass, execution health remains evaluated, and the structure check remains independently reported as fail

#### Scenario: Structural ambiguity remains observable

- **WHEN** a semantic-passing attempt has an ambiguous structural role classification
- **THEN** the affected structure state is `indeterminate` and does not alter semantic completion or execution health

### Requirement: Offline calibration qualifies the v4 mechanism

The v4 private calibration MUST run a matrix of at least seven cases: oracle reference, equivalent reference, baseline scatter, anti-pattern, docs-only, public starter, and ambiguous source. It MUST declare expected labels per fixture and per check, verify Stage 1 snapshot identity, verify Stage 2 leakage boundaries, and complete without candidate or judge model calls.

#### Scenario: Matrix reaches an offline decision

- **WHEN** all offline fixtures execute under the v4 evaluator
- **THEN** the calibration reports per-check observed and expected labels, including failures, and identifies whether offline qualification passed

#### Scenario: Offline qualification is not a model conclusion

- **WHEN** the offline matrix passes
- **THEN** the result only qualifies the mechanism for a separately authorized pilot and does not claim a Practice effect

### Requirement: Validation stays offline and traceable

Implementation MUST include focused tests for profile resolution, staged runner sequencing, snapshot immutability, public/private leakage, deterministic role classification, diff locality, and offline calibration. The final validation MUST run focused tests, `bun run validate`, OpenSpec strict validation, public/private leakage audit, credential and endpoint audit, protected-path diff, and `git diff --check`.

#### Scenario: Final gate is reproducible

- **WHEN** reviewers inspect the PR
- **THEN** validation commands and offline evidence are recorded without model transcripts, credentials, endpoint URLs, private Practice text, or generated workspaces

