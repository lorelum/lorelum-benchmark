## 1. Planning and contract lock

- [ ] 1.1 After this OpenSpec passes strict validation and the OpenSpec-only PR is created, enter the equivalent Plan stage and confirm the exact five-dimension weights, calibration thresholds/repetitions, evidence caps/tool allowlist, budgets, schema names, accounting sidecar shape, and #202 provenance binding with the requester.
- [ ] 1.2 Write the planning answers back to Issue #200, this `design.md`, this delta spec if behavior changes, and this `tasks.md` before any non-OpenSpec implementation starts.
- [ ] 1.3 Keep the initial PR limited to `openspec/changes/async-report-replan-judge-200/`; do not add source, schema, fixture, candidate, runner, evaluator, treatment, or model artifacts before Plan confirmation.

## 2. Evaluation plan and evidence contract

- [ ] 2.1 Add the task-specific evaluation-plan, evidence, and accounting schema definitions under `schemas/` and typed parsers/builders under `src/benchmark/judge/async-report-replan/v1/`; keep `judge-result-v1.schema.json` unchanged.
- [ ] 2.2 Implement the fixed `async-report-replan-evaluation-plan/v1` instance with `llm-subjective` method, evidence/rubric/calibration references, blind-case policy, separate budgets, and MVP claim boundary.
- [ ] 2.3 Implement deterministic `replan-evidence/v1` projection from private raw attempt artifacts, public task inputs, allowlisted tool actions/observations, and the final candidate diff; normalize paths/content and emit stable hashes.
- [ ] 2.4 Reject raw transcripts, System/developer prompts, thinking/reasoning, raw tool results, Practice content, condition/timing/treatment identity, Pack/Practice identity, session IDs, private/absolute paths, secrets, and evaluator/oracle/scoring material before any provider call.
- [ ] 2.5 Pass the generated public-safe evidence through the existing Judge material allowlist and verify deterministic output plus redacted fail-closed errors.
- [ ] 2.6 Add focused tests for valid projection, deterministic hashes, forbidden-marker rejection, path normalization, stage grouping, and raw-transcript rejection.

## 3. Fixed rubric and scoring provider

- [ ] 3.1 Add the fixed five-dimension, 100-point `rubric.yaml` and typed parse/serialize/hash helpers; verify the dimensions cover assumption invalidation, plan revision, implementation-scope adjustment, verification-evidence update, and risk/uncertainty honesty.
- [ ] 3.2 Implement `judge-agent/async-report-replan/v1` with fixed rubric resolution, task-specific prompt construction, structured scoring, provenance hashes, invalid-output fail-closed behavior, and no dependence on `generic/v2` scoring prompt heuristics.
- [ ] 3.3 Register the provider without changing existing provider resolution or behavior; keep real execution behind `LORELUM_JUDGE_REAL=1` and valid provider configuration.
- [ ] 3.4 Implement the self-contained `run.ts` entrypoint for private attempt evidence, with no `condition_id`, `delivery_node`, or treatment parameter, emitting evidence, `judge-result/v1`, and accounting/provenance sidecars.
- [ ] 3.5 Implement the accounting envelope with plan/evidence/rubric/prompt/input/provider/calibration identity, separate calibration/scoring counters, duration, token/cost values when reported, and explicit `unavailable` values otherwise.
- [ ] 3.6 Add provider tests for complete scoring, missing dimension, out-of-range points, invalid output, no opt-in, unavailable config, and preservation of `judge-result/v1`.

## 4. Calibration package

- [ ] 4.1 Add the sibling private package `incubator/practice-injection/async-report-replan-judge-v1/private/` with calibration manifest, expected outcomes, fixtures, and a verified snapshot; do not modify the #196 candidate snapshot or #197 anchor.
- [ ] 4.2 Add reference, equivalent, and surface-only anti-pattern `replan-evidence/v1` fixtures; reference/equivalent must use different observable structure and anti-pattern must show acknowledgement without substantive plan/scope/verification change.
- [ ] 4.3 Implement the calibration runner with separate calibration accounting, explicit real-Judge opt-in, stable hashes, declared thresholds/repetitions, and no CI external model call.
- [ ] 4.4 Add deterministic mock tests for discrimination, equivalence tolerance, anti-pattern separation, fixture provenance, and insufficient-discrimination diagnostic behavior.
- [ ] 4.5 Record that no real calibration result is claimed unless explicitly executed with available credentials; do not convert a failed or unavailable real path into a low score.

## 5. #209 compatibility and isolation

- [ ] 5.1 Document the exact #209 adapter mapping for the fixed plan, evidence adapter, rubric/calibration, provider, and result/accounting envelope in the implementation module or design note without creating a generic planner, registry, or generated-tool workflow.
- [ ] 5.2 Verify the task-specific schemas remain explicitly versioned and no generic `evaluation-plan/v1`, cross-study method selection, or automatic migration is introduced.
- [ ] 5.3 Verify the implementation does not modify the #196 candidate/snapshot, #197 runner behavior, #199 treatment, #202 evaluator, active suite, or formal records.
- [ ] 5.4 Add an integration test or fixture showing that a later #209 adapter can read the fixed plan/evidence identity and invoke the provider without changing its scoring semantics.

## 6. Validation, review, and lifecycle

- [ ] 6.1 Run focused Judge tests, evidence/privacy tests, calibration mock tests, `bun run validate`, `git diff --check`, and OpenSpec strict validation; record commands, results, and any unimplemented real-model checks.
- [ ] 6.2 Run the public/private leakage audit across evidence, fixtures, sidecars, traces, and Agent-workspace boundaries.
- [ ] 6.3 Complete the repository-required two independent read-only reviews for this benchmark-contract PR and record findings and rechecks in the change evidence chain.
- [ ] 6.4 Read back the actual GitHub Issue/PR title, body, important comments, and validation summaries; update Issue #200 and the PR with implementation/status evidence.
- [ ] 6.5 Freeze v1 after merge; any later change to semantics, evidence allowlist, rubric, calibration meaning, or result interpretation creates a new version and does not rewrite historical results.
