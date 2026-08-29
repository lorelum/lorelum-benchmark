# Tasks

## 1. OpenSpec-only branch and PR

- [x] 1.1 Confirm issue #185 is the single traceable scope for this change.
- [x] 1.2 Keep this branch based on latest `origin/main` and use only `codex/llm-provider-gateway-v4-two-stage-structure`.
- [x] 1.3 Validate the OpenSpec change strictly before creating the initial PR.
- [ ] 1.4 Create the initial PR containing only OpenSpec artifacts and required process constraints, referencing #185.
- [ ] 1.5 Verify that the initial PR contains no candidate fixture, starter, runner, evaluator code, model run, result record, or suite revision.

## 2. Planning clarification gate

> Tasks 3 onward MUST NOT start until every item in this section is answered by the requester, written back to issue #185 and design/tasks, and the issue/design/tasks remain mutually consistent.

- [ ] 2.1 Confirm Stage 1 scope: single provider, chat, retry, and basic usage/billing.
- [ ] 2.2 Confirm Stage 2 scope: add a different-wire-protocol provider while preserving public API, usage semantics, and accounting semantics.
- [ ] 2.3 Confirm Stage 1 / Stage 2 budgets and whether they are expressed per stage or per attempt.
- [ ] 2.4 Confirm fresh no-session Stage 2 invocation with the same app workspace and no Stage 1 conversation transcript.
- [ ] 2.5 Confirm whether the existing oracle Practice is reusable after a Stage 2 leakage audit, or requires a new version.
- [ ] 2.6 Confirm the irrelevant Practice and its length-balance limit.
- [ ] 2.7 Confirm the pre-registered saturation threshold and directional-screen stability rule; proposed default is 80%.
- [ ] 2.8 Confirm that later model pilot repetition and analysis rules require a separate explicit authorization outside this change.

## 3. Contracts and schemas

- [ ] 3.1 Define the versioned two-stage profile contract, including conditions, Practice references, stage prompts, stage budgets, snapshot policy, and decision/saturation metadata.
- [ ] 3.2 Define the staged diagnostic plan contract and its identity fields.
- [ ] 3.3 Define the Stage 1 snapshot manifest format, excluded generated paths, canonical ordering, per-file hashes, and tree hash.
- [ ] 3.4 Define the deterministic two-stage evaluator result contract with per-check state, reasons, raw metrics, semantic results, and no weighted score.
- [ ] 3.5 Add schema validation tests for malformed, incomplete, ambiguous, and escaping declarations.

## 4. Staged diagnostic runner

- [ ] 4.1 Add profile resolution that reuses three-condition Practice isolation without modifying `injection-calibration/v1/v2`.
- [ ] 4.2 Add staged plan parsing, candidate identity checks, dry-run validation, and planned-denominator reporting.
- [ ] 4.3 Add Stage 1 workspace provisioning with only the declared Stage 1 prompt, starter, and condition-scoped Practice delivery.
- [ ] 4.4 Add Stage 1 execution, semantic gate, snapshot creation, and fail-closed snapshot verification.
- [ ] 4.5 Add Stage 2 prompt replacement, snapshot immutability check, dependency-input verification, and fresh no-session invocation.
- [ ] 4.6 Add per-stage logs, redacted traces, execution-health states, and summaries that preserve planned denominators.
- [ ] 4.7 Add runner tests using controlled command doubles for sequencing, failure, timeout, leakage, snapshot mutation, and dry-run behavior.

## 5. Deterministic structure evaluator

- [ ] 5.1 Add a versioned AST/import/call/value-edge analyzer with role classification for handler, transport adapter, policy, ledger, and registry/config.
- [ ] 5.2 Add Stage 1 -> Stage 2 diff classification and raw concentration metrics without a weighted score.
- [ ] 5.3 Add deterministic checks for handler stability, transport isolation, policy continuity, ledger continuity, provider extension locality, and diff classifiability.
- [ ] 5.4 Ensure equivalent layouts are accepted by executable structure rather than filenames or identifier names.
- [ ] 5.5 Fail ambiguous classification as `indeterminate` with a redacted reason.
- [ ] 5.6 Add evaluator tests for pass, fail, indeterminate, malformed source, snapshot mismatch, and semantic/structure separation.

## 6. v4 candidate and public/private materials

- [ ] 6.1 Create the independent v4 candidate declaration, source identity, snapshot, runtime declaration, and execution policy.
- [ ] 6.2 Create the Stage 1 public prompt, starter, docs, and public tests without Stage 2 leakage.
- [ ] 6.3 Create the Stage 2 public prompt and stage it only through the runner.
- [ ] 6.4 Create or select oracle and irrelevant Practice cards after leakage and length-balance audits.
- [ ] 6.5 Create private Stage 1 and Stage 2 semantic evaluators that do not expose structure rules or scoring logic.
- [ ] 6.6 Create the private oracle mapping that separates semantic completion from deterministic structure observation.

## 7. Offline calibration matrix

- [ ] 7.1 Create at least seven private fixtures: oracle reference, equivalent reference, baseline scatter, anti-pattern, docs-only, public starter, and ambiguous source.
- [ ] 7.2 Declare expected labels for semantic health, snapshot behavior, and every deterministic structure check.
- [ ] 7.3 Add Stage 2 leakage audits over Stage 1 prompt, starter, docs, public tests, oracle Practice, and irrelevant Practice.
- [ ] 7.4 Run the offline matrix with zero candidate-model calls and zero judge-model calls.
- [ ] 7.5 Record per-fixture, per-check observed and expected labels plus explicit pass/fail classification.
- [ ] 7.6 If any expected label mismatches, stop and preserve evidence; do not tune thresholds or fixtures to force separation.

## 8. Final offline gate

- [ ] 8.1 Run focused runner, evaluator, profile, and calibration tests.
- [ ] 8.2 Run `bun run test:contracts`.
- [ ] 8.3 Run `bun run validate`.
- [ ] 8.4 Run `openspec validate llm-provider-gateway-v4-two-stage-structure --type change --strict`.
- [ ] 8.5 Run public/private leakage, credential, endpoint, and protected-path audits.
- [ ] 8.6 Run `git diff --check`.
- [ ] 8.7 Confirm candidate model calls and judge model calls are zero.
- [ ] 8.8 Confirm that no formal experiment, formal record, suite revision, generated workspace, log, `node_modules/`, or model transcript is committed.
- [ ] 8.9 Update PR evidence with commands, outcomes, offline matrix summary, and explicit statement that passing offline calibration does not establish a Practice effect.
