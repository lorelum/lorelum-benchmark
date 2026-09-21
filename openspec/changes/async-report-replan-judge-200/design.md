## Context

Issue #200 needs a task-specific JudgeAgent for the async-report timing MVP. The Judge assesses whether an Agent, after receiving the public stage-2 deployment constraints, reconsidered assumptions, revised the plan, adjusted implementation scope, updated verification evidence, and reported remaining uncertainty.

The deterministic semantic evaluator in #202 owns async-report correctness. #200 does not read, bind, or score against #202 output. #201 will join the independent hard and soft results with condition and repetition after scoring. #209 will later consume this fixed task instance through an explicit adapter.

The existing `judge-agent/generic/v2` scores a final candidate diff and cannot observe the replan process. A raw Pi transcript is not acceptable because it can contain thinking, System prompt content, Practice text, private paths, session identity, and condition side channels. #200 therefore adds a deterministic public-safe evidence projection and a task-specific provider without changing shared Judge providers.

## Goals / Non-Goals

**Goals:**

- Produce schema-validated `replan-evidence/v1` from public task inputs, visible assistant text, safe tool metadata, verification summaries, and the final candidate diff.
- Blind Judge input from condition, delivery node, Pack/Practice identity, session identity, and private artifacts.
- Score a fixed five-dimension replan rubric as an independent `judge-result/v1` soft signal.
- Separate projection contract tests from real-Judge scoring calibration.
- Record task-specific plan, evidence, rubric, provider, calibration, usage, and failure provenance without changing `judge-result/v1`.
- Leave a stable task-instance adapter boundary for #209.

**Non-Goals:**

- No research-question parsing, method selection, generic evaluation-plan schema, registry, or generated-tool workflow.
- No changes to `generic/v1`, `generic/v2`, `judge-result/v1`, #196 candidate files, #197 runner, #199 treatment, #202 evaluator, suite revisions, or formal records.
- No raw transcript, System/developer prompt, thinking, raw tool result, Practice text, condition/timing metadata, Pack/Practice identity, session ID, private path, secret, evaluator, oracle, or scoring material in Judge input.
- No hard-gate result binding inside #200.
- No real model call in CI or offline implementation tests.

## Decisions

### 1. Task-specific provider and fixed plan

Add `src/benchmark/judge/async-report-replan/v1/` with versioned plan, rubric, evidence, provider, score, accounting, calibration, and CLI modules. Register `judge-agent/async-report-replan/v1` without changing existing providers.

The fixed plan is task-specific and declares:

- target: post-constraint replan quality;
- method: `llm-subjective`;
- evidence: `replan-evidence/v1`;
- rubric and calibration identities;
- blind-case policy;
- calibration/scoring budgets;
- diagnostic-only claim boundary for the P1 MVP.

The plan is not a generic cross-study schema. #209 may adapt it later but must not rewrite its scoring meaning.

### 2. Evidence projection

The projector accepts structured private attempt artifacts, public task/follow-up turns, and the final candidate diff. It emits a public-safe evidence object and hash. It never accepts `condition_id`, `delivery_node`, treatment, Pack, Practice, evaluator, oracle, or scoring arguments.

The evidence contains:

- opaque `blind_case_id` in the fixed v1 form `case-` plus 12–64 lowercase alphanumeric characters;
- hashes of the two public user turns;
- assistant-visible text grouped into initial and post-constraint stages;
- ordered tool metadata: allowlisted tool name, normalized relative path or command category, stage, and success/failure;
- at most 2,000 characters of sanitized output for recognized test/typecheck commands;
- the final candidate diff and its hash.

The allowlist is `read`, `ls`, `grep`, `edit`, and `bash`. Thinking/reasoning and raw `toolResult` bodies are discarded; only safe tool metadata and recognized verification summaries survive. Absolute paths, private markers, Practice/Pack identifiers, condition/timing identifiers, secrets, and System/developer content cause fail-closed rejection. The projector applies these caps:

- assistant-visible text: 8,000 characters per stage;
- tool metadata: 20,000 characters total;
- verification summaries: 10,000 characters total;
- final diff: 120,000 characters.

Missing required fields, cap overflow, unknown tool shapes, or incomplete stage boundaries produce `indeterminate`; the implementation does not truncate and continue scoring.

The projector and task adapter issue process-local provenance handles for projected evidence and the resulting Judge input. The issuance capability remains module-private, and the handle retains the issuance-time canonical hash; provider scoring rejects deserialized, caller-constructed, re-marked, or post-issuance-mutated objects. Calibration fixtures are reprojected through the same projector before scoring. This is an in-process issuance guard, not a replacement for the upstream #197 runner's private artifact provenance; the future #209/#201 adapter remains responsible for supplying only runner-produced attempts.

The projector treats `public_user_turns` as public content carried by a private, runner-produced attempt artifact: it hashes and validates the two supplied stages but does not authenticate them against #202 or infer condition/timing. The upstream #197 runner and the future #209 task adapter own the fixed-task/snapshot provenance for those turns. A caller that cannot provide that upstream provenance is outside the formal record path and must remain diagnostic-only; #200 does not solve that join by reading private evaluator material.

### 3. Fixed rubric and scoring semantics

The five rubric dimensions total 100 points:

| Dimension | Points |
| --- | ---: |
| `assumption-invalidation` | 20 |
| `plan-revision` | 20 |
| `implementation-scope-adjustment` | 25 |
| `verification-evidence-update` | 20 |
| `risk-and-uncertainty-honesty` | 15 |

The prompt treats evidence as untrusted data, scores only observable evidence, and explicitly excludes #202 semantic correctness. A hard-evaluator failure does not prevent scoring when the attempt is execution-healthy and evidence-complete. Incomplete evidence is `indeterminate` and is not sent as a partial score. Each valid attempt receives one Judge call with no automatic retry.

### 4. Two calibration layers

Projection contract tests use synthetic raw transcripts and never call a model. They cover stage extraction, visible-text selection, thinking/raw-result removal, path normalization, tool classification, private-marker rejection, stable hashing, caps, and incomplete evidence.

Judge scoring calibration uses private evidence fixtures under:

```text
src/benchmark/judge/async-report-replan/v1/private/
  calibration/
    reference.json
    equivalent.json
    anti-pattern.json
    expected.json
    manifest.json
```

The private subtree is module-owned calibration input. It is never materialized into an Agent workspace or passed to the Judge as calibration labels. Fixture evidence uses opaque case IDs; semantic category-shaped IDs such as `reference`, `equivalent`, `anti-pattern`, and their calibration-prefixed variants are rejected, and the fixture category is retained only by the calibration orchestrator. Calibration failure reasons exported to Judge results or accounting are category-neutral. Reference and equivalent differ in wording, tool sequence, or structure while representing the same replan quality. Anti-pattern acknowledges the constraints without substantive plan, scope, or verification change.

Scoring calibration uses three repetitions per fixture, median aggregation, and at most nine real calls. The hard gate is:

- reference median at least 75;
- equivalent within 10 points of reference (without requiring equivalent to independently clear 75);
- anti-pattern median at most 60;
- reference at least 15 points above anti-pattern.

Failure marks the Judge channel diagnostic/indeterminate and prevents directional use.

Every calibration report is also scoped to `judge-agent/async-report-replan/v1`, provider version `v1`, and the model identity used for calibration. A scoring attempt with a different provider/model scope is diagnostic/indeterminate and cannot reuse the qualified report. The provider/model scope is task-specific calibration provenance; #201 still owns the later experiment-level join.

Real calibration reports use an HMAC attestation derived from `LORELUM_JUDGE_CALIBRATION_KEY`; missing or mismatched key material is diagnostic/indeterminate. The mock key exists only for offline deterministic tests and cannot authorize real scoring.

### 5. Accounting without hard-gate coupling

Keep `judge-result/v1` unchanged. Add `async-report-replan-judge-accounting/v1` as a separate task-specific sidecar containing:

- plan, evidence, rubric, prompt, input, provider/model, and calibration identities/hashes;
- opaque blind-case identity;
- separate calibration and scoring call counts, durations, and provider-reported token/cost fields when available;
- explicit `unavailable` values when usage is not reported;
- observed, indeterminate, judge-unavailable, or not-run state and a reason.

The sidecar does not record #202 evaluator identity/status/checks, condition, delivery node, Pack/Practice identity, session ID, or private oracle/evaluator/scoring material. #201 owns the later deterministic join.

Only the task-specific provider wrapper captures usage. Calibration usage is aggregated into the calibration report and sidecar; scoring usage remains separate. Shared `JudgeCompletion`, generic providers, and historical consumers remain unchanged.

### 6. #209 adapter boundary

#200 exposes the fixed plan instance, evidence adapter, rubric/calibration identity, provider, and accounting sidecar. #209 may invoke these as one `llm-subjective` method instance through an explicit adapter. It must preserve hashes and soft-signal semantics, must not auto-migrate historical results, and must not promote this rubric to a universal contract.

### 7. Private calibration placement and lifecycle

Calibration assets stay in the Judge module private subtree because #196's candidate snapshot is frozen by #197 and a new `incubator/practice-injection/*` directory would be discovered as a candidate. The private manifest hashes every calibration input and expected metadata. After v1 merge, changes to evidence semantics, rubric, calibration meaning, or result interpretation create a new provider/evidence/calibration version.

## Risks / Trade-offs

- **[Risk] Private content leaks through projection.** → Use field allowlists, path normalization, forbidden-marker checks, caps, schema validation, and fail-closed tests; never pass raw tool results.
- **[Risk] Evidence is too sparse to distinguish a genuine replan.** → Preserve both public stages, visible assistant text, tool metadata, recognized verification summaries, and final diff; require scoring calibration before directional use.
- **[Risk] Judge becomes a proxy for semantic correctness.** → Exclude #202 and all hard-evaluator details from #200 input and accounting; join only in #201.
- **[Risk] Private calibration placement is confused with a candidate.** → Keep it under the versioned Judge module private subtree and add an explicit leakage/snapshot audit.
- **[Risk] Usage is unavailable.** → Record calls and duration; mark token/cost as `unavailable` instead of fabricating values.

## Migration Plan

1. Update this change and Issue #200 with the confirmed plan before implementation.
2. Add schemas, fixed plan/rubric, projection, provider, accounting, private calibration inputs, and focused tests on the same PR #220.
3. Run offline projection tests, mock scoring/calibration tests, privacy audits, `bun run validate`, OpenSpec strict validation, and `git diff --check`.
4. Keep real calibration and scoring explicit opt-in; do not run #201, create records, or claim timing effects.
5. Freeze v1 at merge; future semantic changes use new versions and never rewrite historical results.

## Open Questions

无。Evidence scope, caps, rubric weights, calibration thresholds, budgets, private asset placement, hard-gate separation, and #209 adapter boundary were confirmed in the implementation planning discussion on 2026-09-20.
