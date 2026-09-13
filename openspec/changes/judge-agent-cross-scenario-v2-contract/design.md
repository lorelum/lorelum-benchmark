## Context

Issue #198 is a design-stage follow-on to the repository's JudgeAgent foundation. #132 separated execution health, semantic completion, and quality soft signals. #133 established the public-only JudgeAgent input constructor, `judge-result/v1`, provenance hashes, fail-closed behavior, and mock-by-default CI posture. #146 connected task-scoped judge providers to the runner without allowing quality to change semantic completion. #153 introduced the repository-level generic LLM JudgeAgent and retained the requirement for calibration before directional use.

The current generic provider is not yet a cross-scenario facility. `generic/v2/rubric.ts` and `score.ts` contain an engineering-quality guideline and score prompt that name frontend transport isolation as well as LLM-gateway retry, provider-protocol, budget, and metering signals. Those signals are useful for their original scenarios, but they are task-type assumptions rather than a declared scenario contract. `generic/v2/calibrate.ts` can report calibration outcomes, but no reusable scenario descriptor, rubric approval state, scenario-family admission gate, or descriptor-to-result provenance exists.

This change produces the contract and validation plan only. It has no authority to change the current fixed-rubric MVP, make model calls, add candidate fixtures, or report benchmark conclusions.

## Goals / Non-Goals

**Goals:**

- Specify the smallest public descriptor that lets a future judge understand a scoring scenario without receiving Oracle, evaluator, condition, Practice, calibration labels, or other private material.
- Specify a clear separation between generating/advising a rubric and scoring with an approved rubric, including version/hash/provenance and invalid/indeterminate semantics.
- Specify how reference, equivalent, and anti-pattern calibration examples establish discrimination rather than merely demonstrating that an LLM returned JSON.
- Specify the compatibility boundary: cross-scenario judgment remains public-only, opt-in for real models, mockable in CI, fail-closed, and a quality sidecar only.
- Make all unresolved choices explicit so they can be answered during the required Plan-mode clarification and written back to issue #198 and these artifacts before any implementation work starts.

**Non-Goals:**

- Do not implement a new provider, change `judge-agent/generic/v2`, change `JudgeProvider`, modify `judge-result/v1`, or select an external model/provider.
- Do not create task/candidate/calibration fixtures, a private oracle, a formal record, a model run, a runner integration, or a migration of existing fixed rubrics.
- Do not let either an LLM-generated rubric or a quality score determine semantic completion, execution health, task admission, or a formal experimental conclusion.
- Do not infer hidden product requirements from candidate source or use task-type-specific prompt heuristics as a substitute for a descriptor.

## Decisions

### 1. Use a public, scoped scenario descriptor rather than task text alone

A future facility SHALL accept a versioned `judge-scenario-descriptor/v1` alongside the existing public task and candidate evidence. Its minimal public fields are: stable identity/version; concise scenario purpose; explicit observable behaviors; quality signals with reviewable evidence expectations; declared admissible public evidence paths/types; exclusions/non-goals; and uncertainty boundaries. The descriptor is source-controlled, hashable, and narrow enough to scope a rubric without embedding a private answer key.

**Why this over relying on `task.md`:** task text establishes the coding request but normally does not identify which engineering-quality signal is deliberately being studied, what evidence is admissible, or when a reviewer must abstain. Adding hidden evaluator content would violate the #133 public-input contract.

**Rejected alternative — task-type templates in the prompt:** a global prompt listing frontend/gateway patterns gives irrelevant prior instructions to unrelated scenarios and makes the rubric generation look generic when it is not.

**Rejected alternative — allow an opaque free-form context blob:** it cannot be path-audited, safely versioned, or reviewed for private-material leakage.

### 2. Treat generation as advice; score only with an approved rubric identity

A future rubric generator may emit a `rubric-proposal/v1` bound to the descriptor hash, public task/evidence inventory hash, generator identity/version, prompt hash, and proposal hash. Its output is advisory. A scenario owner must explicitly accept, edit, or reject it into a versioned approved rubric before it is used for scored reporting or calibration admission. The approved rubric records its source descriptor hash, stable rubric version/hash, selected dimensions/weights, evidence requirements, and approval provenance.

**Why this over automatic generation-and-scoring:** a model cannot validate its own coverage, hidden assumptions, or discriminatory power. Separating proposal from approval preserves reviewability and makes a changed prompt/model an explicit new provenance input.

**Compatibility:** existing fixed task-specific rubrics remain approved by their current versioned mechanism. A future generic provider version must not silently reinterpret a `generic/v2` rubric or overwrite an existing rubric hash.

### 3. Bind score evidence and provenance through a companion context/provenance artifact

`judge-result/v1` already binds a score to prompt, rubric, and input hashes. The future facility needs auditable linkage to descriptor identity, evidence inventory, rubric lifecycle state, and calibration package without silently extending a frozen schema. The preferred design is a versioned companion context/provenance sidecar (name and exact schema are deferred to the Plan confirmation) that records hashes and public identities, never raw private acceptance labels or oracle material.

The judge is given only the descriptor, public task/material selected by the existing allowlist, candidate diff/source, and the approved rubric. Each criterion rationale must cite supplied evidence by file/symbol/behavior or identify the missing evidence. If evidence is insufficient, contradictory, or outside the descriptor boundary, the result is `indeterminate`/`judge-unavailable` under the existing outcome contract; it is not a guessed low score.

**Why this over adding descriptor fields to `judge-result/v1`:** #132/#133 prohibit silent extension of frozen versions. A sidecar preserves backward interpretation while allowing a later versioned migration only if consumers truly need an inline field.

### 4. Separate public judge inputs from private calibration acceptance material

A calibration package is a versioned scenario-family artifact containing reference, behaviorally equivalent, and anti-pattern candidates. Each candidate is judged using the same public-only input builder and descriptor/rubric path intended for production. The private package retains expected ordering/acceptance thresholds, semantic-oracle evidence, and any quality labels; neither those labels nor threshold values are passed to the judge, agent workspace, public prompt, trace, or public report.

The package must establish at least: high/acceptable reference behavior, equivalence tolerance for a materially different but valid implementation, and a detectable anti-pattern that violates the declared quality signal while preserving enough semantic behavior to make quality judgment meaningful. One calibration run is evidence, not a universal-quality claim.

**Why this over reference-only demonstrations:** reference-only scoring cannot establish invariance to implementation style or separation from the declared negative pattern.

### 5. Admit a scenario family only after bounded discrimination evidence

A future consumer may use cross-scenario scoring for directional quality analysis only after the relevant scenario family has an approved descriptor/rubric and a passing private calibration review. The review must document result ordering/tolerance, repeatability or disagreement handling, indeterminate/unavailable rates, and the boundary beyond which the facility remains experimental. Until then the result is diagnostic only; existing fixed rubrics remain the supported choice for that scenario.

The initial validation plan must include two non-isomorphic scenario descriptors—one UI/service-boundary scenario and one cross-request gateway/policy scenario—to prove that the descriptor contract, rather than the current hard-coded prompt, carries the relevant quality signal. These are descriptor/calibration-package designs, not new benchmark fixtures in this change.

## Risks / Trade-offs

- **Descriptor becomes a public oracle or leaks treatment/private scoring logic** → Keep it limited to product-visible behavior, reviewable quality signals, admissible evidence, exclusions, and uncertainty; run a dedicated public/private exclusion review before implementation and before every descriptor is consumed.
- **Descriptor is too vague, leading to generic praise or task-type priors** → Require concrete evidence expectations and an abstention boundary; reject descriptors that cannot distinguish a reference, equivalent, and anti-pattern example.
- **Rubric approval becomes ceremonial** → Bind every scoring/calibration attempt to descriptor/rubric hashes and require private calibration evidence before directional use.
- **Calibration overfits to one candidate layout** → Require a materially different equivalent implementation and prohibit path/name/helper-specific rubric criteria.
- **Real-model variance or outage masquerades as low quality** → Preserve mock/default-no-network behavior, explicit real-model opt-in, provider/version/prompt provenance, repeat/disagreement evidence, and fail-closed `indeterminate`/`judge-unavailable` states.
- **A design change alters current runner conclusions accidentally** → Keep this issue documentation-only; any provider/schema/runner/fixture work needs a subsequent implementation OpenSpec and its own lifecycle gates.

## Migration Plan

1. Complete the artifact-only PR for #198 and strict validation.
2. Enter the required Plan-mode clarification. Confirm the open questions below with the requester; record the answers in issue #198 plus this design and `tasks.md`.
3. Finish the documentation-only deliverables: capability mapping, two descriptor/calibration-package outlines, and a public/private exclusion review. No model or benchmark execution occurs.
4. If the resulting plan warrants implementation, open a separate implementation change from a new issue/PR chain. That later change selects the provider/version, schema/sidecar, exact calibration fixtures, and validation thresholds; it must not modify frozen generic/v2 behavior in place.
5. If calibration cannot demonstrate discrimination across the selected scenario families, retain the facility as experimental and continue using fixed task-specific rubrics.

Rollback for this change is removal of its unmerged documentation-only OpenSpec artifacts. No runtime behavior, fixture, record, or schema is changed.

## Open Questions — Plan-mode Gate

The following choices materially affect input boundaries, evaluation semantics, calibration, and conclusion interpretation. They MUST be confirmed in Plan mode before any implementation, candidate fixture, model invocation, or formal record:

1. **Descriptor minimum:** Are the listed public fields sufficient, and which public evidence types (task text, starter files, candidate diff, explicitly declared public run output) may be included? Is a source-controlled descriptor required per scenario or may a shared family descriptor be referenced?
2. **Approval authority and storage:** Who approves a generated rubric, how is approval provenance represented, and should the approved artifact be public source, a condition-scoped private artifact that is never injected into the judge, or a separate reviewed manifest? The answer must preserve the public-only input rule.
3. **Provenance format:** Is a `judge-context/v1`-style companion sidecar the preferred first implementation, or is a new `judge-result/v2` necessary? Which consumers need descriptor/rubric approval provenance directly?
4. **Validation coverage and threshold:** Which two non-isomorphic scenario families are in scope, what repeat/disagreement/indeterminate limits make calibration adequate, and what exact private acceptance ordering/tolerance qualifies a family for directional use?
5. **Model and blind-evaluation boundary:** Which model/provider/version, system prompt ownership, temperature/retry policy, budget, real-model opt-in control, and blinded reviewer access are permitted? What is the rule for provider failure and cost reporting?
6. **Migration boundary:** Which existing `generic/v2` consumers, if any, may adopt the future facility, and what evidence is required before a fixed task-specific rubric can be replaced or retired?
