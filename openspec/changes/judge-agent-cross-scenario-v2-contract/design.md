## Context

Issue #198 follows the repository’s existing JudgeAgent work. #132 separated semantic completion from soft quality; #133 established public-only input, provenance, fail-closed behavior, and mock-by-default; #146 connected Judge providers to the runner; #153 delivered a generic code-task rubric-and-score path. `generic/v2` improved that path but its quality guidance still reflects specific code-quality domains.

The current MVP has distinct, deliberately bounded evaluation work. #200 applies a task-specific, blinded soft Judge to whether an Agent reconsiders assumptions and plans after receiving deployment constraints; #202 owns deterministic correctness. #192 uses deterministic structure-pass counts and explicitly does not use an LLM Judge. These are useful design walkthroughs because the appropriate evaluation method differs; they do not define the universe of research or prove generality.

This change specifies a future capability only. It does not implement provider/code generation, modify #200/#192, add schemas or fixtures, invoke models, run experiments, or create records.

## Capability Map

| Existing capability | Reusable foundation | Gap or prohibited assumption |
|---|---|---|
| #132 outcome separation | Execution health, semantic hard gate, and quality soft signal remain separate. | Do not turn a Judge score into task completion or experimental fact. |
| #133 JudgeAgent soft-scoring | Public-only allowlist, `judge-result/v1`, provenance, fail-closed output, mock/default-no-network. | No private Oracle, evaluator, scoring, Practice payload, or undeclared condition data in model input. |
| #146 provider/runner integration | Versioned provider resolution and indeterminate handling can be reused by a later consumer. | #198 does not alter runner integration or use it to evaluate delivery timing. |
| #153 and `generic/v1` | Rubric generation, structured scoring, explicit real-model opt-in, and calibration are existing building blocks. | Their code-task rubric-and-score flow does not itself select a method for a research question. |
| `generic/v2` | Existing rubric validation/hash, evidence-oriented scoring, fixed-rubric option, and calibration runner. | Frontend transport and gateway policy guidance are task-specific; do not treat them or their thresholds as universal. |
| `src/benchmark/judge/input.ts` | Path-level public allowlist, redacted failure, and input hash. | It accepts judge materials; it does not decide which evidence/method answers a study question or draft a new evaluator. |

The missing capability is a research-question planning step that can select deterministic, LLM, human, combined, or no-Judge evaluation; identify evidence gaps; and, only when approved, request a measurement-only code draft. Existing task-specific rubrics remain valid and are not automatically replaced.

## Goals / Non-Goals

**Goals:**

- Make evaluation assistance responsive to the research question, not to a fixed task category or universal quality rubric.
- Use the confirmed research issue/OpenSpec as the context source; do not require a duplicate brief for unrelated engineering work.
- Have the assistant recommend deterministic, LLM-based, human, combined, or no-Judge methods; explain evidence needs, limitations, and when it must ask the researcher for clarification.
- Permit a future assistant to draft an evaluator/analysis tool after the researcher approves a plan, limited to already approved evidence and subject to human code review.
- Preserve study-specific calibration, blinding, privacy, provenance, and the existing rule that Judge quality is not a semantic hard gate.

**Non-Goals:**

- Do not implement the assistant, a provider, code generator, evaluator, runner, instrumentation, task, schema, fixture, or environment change in #198.
- Do not require Judge evaluation for pure engineering setup, bug fixes, or work without an outcome/comparison question.
- Do not let the model inspect private Oracle, evaluator, scoring configuration, private Practice payload, or real condition mapping.
- Do not let generated code modify how experiments deliver treatments or collect evidence; missing observations are reported as a gap and planned separately.
- Do not replace `generic/v1`/`generic/v2`, #200’s MVP rubric, deterministic evaluators, or prior results.

## Decisions

### 1. Start from the research question, not a task descriptor

The workflow is relevant when a study needs to evaluate or compare outcomes. It reads the confirmed issue/OpenSpec, then identifies the decision being made, unit of analysis, available approved evidence, and conclusion boundary. Pure engineering work does not need to declare “Judge applicable / not applicable.” A study may explicitly conclude that no Judge is appropriate.

**Rationale:** a mandatory field on every task card or every engineering issue would add process without improving the evaluation of a research outcome. The issue/OpenSpec already holds the research intent.

### 2. Produce a reviewable evaluation plan before scoring or code drafting

The plan describes, as applicable: the research question and outcome; comparison/evaluation unit; candidate evidence; suitable deterministic, LLM, and human roles; metric/rubric and aggregation proposal; missing observations; method-specific validation; privacy/blinding; and limits on conclusions. If an unresolved choice changes the primary outcome, evidence, or conclusion, the assistant asks rather than finalizing a plan with a hidden assumption.

The researcher’s approval authorizes only the actions explicitly declared in that plan. If no LLM judgment or new tool is warranted, the workflow does not add one.

### 3. Allow optional tool-code drafts, not unreviewed execution changes

After plan approval, a future JudgeAgent may draft a deterministic evaluator or analysis script that consumes already available, approved evidence. It may not alter runner delivery, add trace/instrumentation, edit task/environment assets, or read private labels to invent a score. If data is missing, it reports the gap for a separately scoped change.

A generated draft remains untrusted until a human reviews it. Only after code review may an explicitly authorized isolated smoke use public or synthetic samples. Formal integration and any benchmark-code changes follow their own issue/OpenSpec/PR, validation, and lifecycle gates. Tool generation is conditional, not a mandatory step for every study.

### 4. Separate study design, blind scoring, deterministic aggregation, and human interpretation

The planning stage may use the approved high-level research question and comparison framing, but only after private details are excluded. A scoring call receives only the declared, allowlisted evidence and approved rubric; where condition identity could bias judgment, the evidence is blinded. A deterministic aggregator may join blinded results back to the pre-registered comparison after scoring. LLM quality remains a soft signal; it cannot change semantic completion, execution health, or a formal record’s facts. Human researchers retain responsibility for interpreting conclusions.

This reuses `judgeagent-soft-scoring` and `benchmark-outcome-contract`; #198 does not rewrite those contracts.

### 5. Validate the method that the study actually uses

Validation is study-specific. Deterministic evaluators use known cases, invariants, or mutation/negative tests appropriate to their metric. LLM scoring requires a relevant calibration/reliability plan, with private acceptance labels kept outside model input. Human review requires a declared review protocol where it is part of the outcome. No universal reference/equivalent/anti-pattern package or score threshold is required for every study.

Two non-normative walkthroughs check method selection: #200 should preserve its blinded, task-specific LLM soft-score role; #192 should remain a deterministic comparison with no LLM Judge. Passing these walkthroughs demonstrates only that the design distinguishes those cases—not generality across all future research.

### 6. Preserve versioned provenance and existing consumers

Future plans, approved rubrics, generated code, and resulting scores must be traceable to source issue/OpenSpec revision and content hashes. The implementation must not silently extend or reinterpret `judge-result/v1`; if its existing hashes cannot express a required relationship, use a separately versioned artifact or schema in the follow-up implementation change.

Existing generic providers and fixed rubrics remain unchanged. Any future consumer opts into a new, versioned capability only after its own validation; no automatic migration occurs.

## Non-normative Design Walkthroughs

These walkthroughs check that the design can choose different methods. They are not scope limits, calibration requirements, or evidence that the capability generalizes.

- **#200 — adaptation-quality soft signal:** the study asks whether the Agent reconsidered assumptions, plan, implementation, and validation after new constraints. Keep its fixed, blinded, task-specific LLM rubric for the current MVP; #202 retains deterministic semantic correctness. Do not use the Judge to decide which delivery timing is better, and do not migrate #200 automatically.
- **#192 — deterministic structure comparison:** the study compares a predeclared deterministic structure-pass measure across paired blocks and explicitly excludes an LLM Judge. Recommend the existing deterministic evaluation and aggregation approach; do not add an LLM score or generate another tool when the existing one answers the question.

## Public/Private and Blinding Review

| Stage | Permitted model context | Excluded from model input |
|---|---|---|
| Evaluation planning | Redacted, approved research question, high-level comparison purpose, and inventory of approved evidence. | Private Oracle/evaluator/scoring content, private Practice payload, real condition mapping, credentials, or private calibration labels/thresholds. |
| Subjective scoring | Only declared, path-allowlisted evidence and approved rubric; use blind IDs when condition knowledge could bias judgment. | Private acceptance material and condition/treatment identity or timing labels when blinded scoring is required. |
| Tool-code drafting | Approved evidence interfaces and public/synthetic examples needed to draft a reader or analyzer. | Private labels, hidden expected outcomes, private paths, and protected scoring configuration. |
| Smoke and reporting | After code review, isolated public/synthetic samples; report version/hash and redacted reason as appropriate. | Private raw artifacts or mapping in model prompts, public traces, or public summaries. |

New observation/runner instrumentation is not generated in this workflow. It is reported as an evidence gap and handled in a separately scoped change. Generated evaluator code remains subject to repository public/private storage and lifecycle rules.

## Risks / Trade-offs

- **The planner sees hidden scoring/condition information** → construct a redacted research context; keep private Oracle, evaluator, scoring, Practice payload, and real condition mapping outside all model inputs.
- **The assistant invents a metric when the study is underspecified** → require clarifying questions for decision-critical gaps and keep assumptions visible in a non-final proposal.
- **Generated code changes the experiment rather than measuring it** → restrict drafts to already approved evidence; route new collection/runner/task/environment changes to a separate issue and OpenSpec.
- **A study-specific score is overstated as universally valid** → validate each method for its declared study and limit claims to that scope.
- **Generic work changes old results** → version the future capability and preserve `generic/v1`, `generic/v2`, #200, and all historical provenance.

## Migration Plan

1. Complete the design-only #198 OpenSpec and its artifact-only PR #205 after strict validation.
2. Once the design is complete, create a separate implementation issue for the research-adaptive planning, optional code-draft, and scoring workflow; implement it under its own OpenSpec and initial PR.
3. Keep #200 on its current task-specific rubric and execution path. It may be evaluated for migration only under a later explicit issue after the generic capability has passed relevant validation; no automatic migration or reinterpretation is allowed.
4. Until an applicable method is validated, keep its output diagnostic/experimental and use existing deterministic evaluators or fixed task-specific rubrics.

Rollback of #198 is removal of its unmerged design artifacts; it has no runtime effect.

## Stable Capability Rationale

The requirements are intended to remain valid beyond the motivating issues, model, task, profile, and repository directory: research objectives can call for different evaluation methods; evaluators need approved evidence and visible limitations; generated measurement code must not silently change treatment delivery or evidence collection; private acceptance material must remain separate from model input; and a quality opinion must not become a semantic fact. #200 and #192 are examples only, not sources of universal thresholds or implementation assumptions.

## Open Questions

No planning questions remain for this design-only change. Exact provider/model configuration, schema names, code-generation runtime, and any concrete generated evaluator belong to the separately tracked implementation change.
