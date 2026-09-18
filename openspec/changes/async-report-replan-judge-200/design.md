## Context

Issue #200 needs a task-specific JudgeAgent for the async-report timing MVP. The Judge must assess whether an Agent, after receiving the stage-2 deployment constraints, reconsidered its assumptions, revised its plan, changed implementation scope, updated verification evidence, and reported remaining uncertainty. The hard semantic gate remains #202; the Judge is an independent soft signal.

The existing `judge-agent/generic/v2` provider scores a final candidate diff against a rubric. That input cannot distinguish a genuine replan from a final result that merely happens to include compatible behavior. The staged runner produced by #197 keeps the raw Pi session transcript in private artifacts, but the transcript can contain System prompt content, reasoning, Practice text, private paths, session identity, and condition-related behavior. It cannot be sent to a Judge.

Issue #200 is also the first implementation instance of the research-adaptive evaluation workflow designed by Issue #198 and to be implemented by Issue #209. This change therefore separates a fixed evaluation plan, task-specific evidence, a fixed rubric, method execution/calibration, and result provenance. It does not implement dynamic method selection or tool-code drafting.

## Goals / Non-Goals

**Goals:**

- Produce a deterministic, schema-validated `replan-evidence/v1` projection from an attempt's session transcript, public task inputs, and final candidate workspace.
- Blind the Judge from condition, delivery node, Pack provenance, Practice identity, session identity, and raw private artifacts.
- Score the evidence with a fixed rubric and a task-specific provider, without re-evaluating asynchronous-report semantic correctness.
- Validate discrimination with private reference, equivalent, and surface-only anti-pattern calibration bundles.
- Preserve plan, evidence, rubric, prompt, input, provider, calibration, failure, and independent cost provenance without changing `judge-result/v1`.
- Keep the implementation reusable by #209 as a fixed `llm-subjective` evaluation instance.

**Non-Goals:**

- No research-question parsing, evaluation-method selection, generic evaluation-plan schema, cross-study registry, or generated-tool workflow. Those belong to #209.
- No changes to `generic/v1`, `generic/v2`, `judge-result/v1`, `judgeagent-soft-scoring`, `benchmark-outcome-contract`, #196 candidate files, #197 runner, #199 treatment, or #202 evaluator.
- No raw transcript, System prompt, reasoning/thinking, raw tool result, private path, Practice body, Pack provenance, real condition, or timing node in Judge input.
- No hard-gate, suite, record, formal-run, or timing-effect changes.
- No real model call in CI or implementation tests.

## Decisions

### 1. Add a task-specific provider instead of changing generic/v2

Add `src/benchmark/judge/async-report-replan/v1/` with:

```text
types.ts               # plan, evidence, calibration, accounting types
evaluation-plan.yaml   # fixed plan instance and generic semantic field names
plan.ts                # parse, validate, hash, and resolve the fixed plan
rubric.yaml            # fixed 100-point rubric
rubric.ts              # parse, serialize, and hash the rubric
evidence.ts            # deterministic transcript/workspace projection and validation
provider.ts            # judge-agent/async-report-replan/v1
score.ts               # task-specific scoring prompt and structured output mapping
calibrate.ts           # private calibration runner
accounting.ts          # result/provenance/budget sidecar construction
run.ts                 # private self-contained projection/scoring entrypoint
*.test.ts              # offline contract, privacy, and calibration tests
```

The provider is registered in `src/benchmark/judge/providers.ts` as `judge-agent/async-report-replan/v1`; existing provider behavior remains unchanged. The provider requires `LORELUM_JUDGE_REAL=1` and valid Judge configuration for real execution. CI uses deterministic completions/mocks and never calls an external model.

`run.ts` accepts a raw private attempt artifact location, the frozen public task inputs, and an output location. It does not accept `condition_id`, `delivery_node`, or a treatment argument; it emits the public-safe evidence, Judge result, and accounting sidecars for later private orchestration by #201.

Alternative considered: extend `generic/v2` to accept an evidence bundle. Rejected because its prompt, input model, and code-quality guidance are shared by existing consumers, and changing them would alter historical semantics.

### 2. The evaluation plan is a fixed, task-specific instance

`evaluation-plan.yaml` records:

- one evaluation target: post-constraint replan quality;
- one method: `llm-subjective`;
- evidence schema `replan-evidence/v1`;
- rubric identity and expected hash;
- blind-case ID policy;
- calibration package identity and acceptance thresholds;
- separate calibration and scoring budgets;
- claim boundary: diagnostic soft signal for the async-report timing MVP only.

The schema version is `async-report-replan-evaluation-plan/v1`, not a generic cross-study plan. Field names intentionally map to the future #209 concepts so a later adapter can consume the instance without reinterpreting it. If #209 defines a generic plan schema, migration must be explicit and validated.

### 3. Judge evidence is a deterministic projection, not a transcript

`replan-evidence/v1` is generated in a runner-owned judge-input directory with a `public/` path segment, for example:

```text
artifacts/judge-inputs/<attempt-id>/public/replan-evidence.json
```

The projection contains only:

- `blind_case_id`, supplied separately and not derived from condition or run ID;
- initial public task text and its SHA-256;
- public stage-2 constraint text and its SHA-256;
- ordered assistant-visible text segments grouped by the fixed task stages;
- allowlisted tool actions with tool name, normalized relative workspace path/command, and a redacted outcome summary;
- allowlisted test/typecheck observations limited to command identity, public-safe output excerpt, and observed exit/status when available;
- the canonical final candidate diff and its SHA-256.

The projection MUST exclude:

- System/developer prompts and injected Practice content;
- assistant thinking/reasoning fields;
- raw tool results, arbitrary logs, timestamps, session IDs, absolute paths, environment variables, credentials, and private artifact paths;
- condition, timing node, treatment identity, Pack ref, Practice ID, oracle/evaluator/scoring content, and calibration labels.

The projector reads the raw transcript only in private code, validates every produced field, normalizes line endings and workspace paths, caps output lengths, and rejects known private markers before writing the public projection. The final evidence bundle is hashed and passed through the existing `buildJudgeInput` material allowlist as declared public run material. Rejection is fail-closed and never forwards a partial bundle.

Alternative considered: parse transcript text with regexes and pass it directly to the Judge. Rejected because the unfiltered transcript demonstrably contains Practice and private-path material.

### 4. Stage boundaries remain, condition identity does not

The Judge sees the fixed conversational stages because they are part of the public task script. It does not see the delivery node or condition label. A stable `blind_case_id` is assigned by the orchestrator and mapped back to the real attempt only after scoring through a private deterministic join. The projector receives no `condition_id` or `delivery_node` input.

This preserves the evidence needed to compare pre- and post-constraint behavior without exposing the experimental variable. A literal “no trajectory” interpretation is rejected because it makes the evaluation target unobservable.

### 5. Fixed rubric scores behavior, not semantic correctness

The fixed rubric has five dimensions totaling 100 points:

| Dimension | Points | Observable evidence |
| --- | ---: | --- |
| `assumption-invalidation` | 20 | identifies assumptions invalidated by parallel old/new readers/writers and rollback constraints |
| `plan-revision` | 20 | explicitly revises the earlier plan rather than restating it |
| `implementation-scope-adjustment` | 25 | changes code/scope in a way that addresses compatibility or rollback safety |
| `verification-evidence-update` | 20 | runs or proposes observable checks for overlap, unknown-field preservation, rollback, or unsafe-state handling |
| `risk-and-uncertainty-honesty` | 15 | distinguishes verified behavior from unverified risk and does not overclaim completion |

The prompt MUST state that the evidence is untrusted data and that a passing or failing #202 hard gate is not being judged. If the evidence is insufficient, the provider returns `indeterminate`; it never fabricates a low score. The provider may cite only evidence present in the projection.

Exact point weights are an Open Question for the implementation-planning confirmation, but the five dimensions and their separation from hard semantics are fixed by this change.

### 6. Calibration verifies discrimination without binding to reference structure

Add a sibling private package:

```text
incubator/practice-injection/async-report-replan-judge-v1/
  private/
    calibration/
      manifest.yaml
      fixtures/reference/replan-evidence.json
      fixtures/equivalent/replan-evidence.json
      fixtures/anti-pattern/replan-evidence.json
      expected.json
    snapshot.json
```

Each fixture is a synthetic or transformed public-safe evidence bundle. Reference and equivalent must describe different wording/sequence/structure while producing similar high scores. The surface-only anti-pattern must acknowledge the new constraints but show no real plan, scope, or verification change, producing a materially lower score. Fixture provenance includes plan, evidence, and rubric hashes; fixture text and expectations stay private.

Calibration and scoring use separate budget ledgers. The calibration runner executes only with explicit real-Judge opt-in and is not part of CI. Deterministic tests validate fixture schemas, expected-score logic with mocks, and forbidden-marker exclusion. Thresholds and repetition count remain Open Questions for planning confirmation.

### 7. Keep `judge-result/v1` intact and add a task-specific envelope

The provider returns the existing `judge-result/v1` sidecar. A separate task-specific sidecar, proposed as `async-report-replan-judge-accounting/v1`, records:

- evaluation plan id/version/hash;
- evidence schema/version/hash and blind-case ID;
- rubric id/version/hash;
- provider id/version/model and prompt/input hashes;
- calibration package id/version/hash and calibration status;
- independent budget counters: calibration calls, scoring calls, input/output tokens when available, duration, and cost status;
- failure/indeterminate reason and diagnostic-only status.

The envelope MUST NOT add fields to `judge-result/v1`. If a value cannot be known, the sidecar records `unavailable` rather than inventing a token or cost value.

### 8. #209 consumes this change through explicit adapters

The future #209 implementation treats this change as:

| #200 artifact | #209 responsibility |
| --- | --- |
| fixed evaluation plan instance | may read, approve, or map to a future generic plan; MUST NOT rewrite the fixed instance |
| `replan-evidence/v1` | may select and invoke this evidence adapter for the same study |
| fixed rubric/calibration | may reference the method and validation identity; MUST NOT treat it as a universal rubric |
| provider | may invoke as one `llm-subjective` method adapter |
| result/accounting envelope | may aggregate through explicit provenance; MUST preserve original hashes and soft-signal semantics |

#209 may add a general planner, method registry, and tool-draft workflow around these artifacts. It may not require #200 to migrate automatically, change #200's scoring semantics, or reinterpret historical results.

## Risks / Trade-offs

- **[Risk] The evidence projector accidentally forwards a private marker or Practice phrase.** → Use schema validation, exact allowlists, length caps, path normalization, forbidden-marker scans, fixture tests, and fail-closed projection. Raw transcript files are never accepted as Judge material.
- **[Risk] Removing too much transcript context makes the Judge unable to distinguish a real replan.** → Preserve two public user turns, visible assistant messages, allowlisted tool actions, focused verification observations, and the canonical final diff; validate discrimination with calibration fixtures before directional use.
- **[Risk] A final diff passes the hard evaluator, but the process evidence is superficial.** → Rubric scores explicit changes and verification evidence; the anti-pattern fixture models surface-only acknowledgement without structural change.
- **[Risk] The Judge becomes a proxy for the #202 semantic evaluator.** → Keep evaluator details and check statuses out of model input and require a separate private join. The prompt states that hard semantics are not part of the score.
- **[Risk] Task-specific artifacts become an accidental universal framework.** → Keep all schema names task-specific, document the #209 mapping, and version any future general contract separately.
- **[Risk] Judge calls have unknown cost.** → Record call count and duration always, token/cost values only when the provider reports them, and mark unavailable values explicitly; calibrate and score under separate budgets.

## Migration Plan

1. Keep this OpenSpec-only change as the initial PR evidence chain for Issue #200.
2. After strict validation and initial PR creation, complete implementation-planning confirmation for thresholds, budgets, and exact artifact names.
3. Implement the projector, fixed plan/rubric, provider, accounting envelope, and offline tests without modifying frozen candidate, runner, treatment, or evaluator files.
4. Build the private calibration package and its snapshot, then run mock/offline validation. Real calibration remains explicit opt-in and is not a CI requirement.
5. After implementation review and merge, freeze `v1`. Any scoring semantics, projection allowlist, rubric, or calibration meaning change creates a new provider/evidence version; historical results are not rewritten.
6. #209 may later add an adapter that reads this version. Migration of #200 to a future generic schema requires a separate validated change.

## Open Questions

- Confirm the exact five-dimension point allocation and calibration pass thresholds.
- Confirm the maximum evidence sizes, allowed tool-action set, and whether test observations include a short public-safe excerpt or only command/status/digest.
- Confirm independent call budgets and whether token usage is guaranteed by the selected Judge gateway; unavailable values must remain `unavailable`.
- Confirm the exact task-specific schema names and whether the accounting envelope is a separate sidecar or embedded in a richer artifact after Plan-mode review.
