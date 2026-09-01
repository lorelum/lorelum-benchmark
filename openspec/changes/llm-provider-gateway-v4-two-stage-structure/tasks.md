# Tasks

## 1. OpenSpec-only branch and PR

- [x] 1.1 Confirm issue #185 is the single traceable scope for this change.
- [x] 1.2 Keep this branch based on latest `origin/main` and use only `codex/llm-provider-gateway-v4-two-stage-structure`.
- [x] 1.3 Validate the OpenSpec change strictly before creating the initial PR.
- [x] 1.4 Create the initial PR containing only OpenSpec artifacts and required process constraints, referencing #185.
- [x] 1.5 Verify that the initial PR contains no candidate fixture, starter, runner, evaluator code, model run, result record, or suite revision.

## 2. Planning clarification gate

> Tasks 3 onward MUST NOT start until every item in this section is answered by the requester, written back to issue #185 and design/tasks, and the issue/design/tasks remain mutually consistent.

- [x] 2.1 Confirm Stage 1 scope: single provider, chat, retry, and basic usage/billing.
- [x] 2.2 Confirm Stage 2 scope: add a different-wire-protocol provider while preserving public API, usage semantics, and accounting semantics.
- [x] 2.3 Confirm Stage 1 / Stage 2 budgets and whether they are expressed per stage or per attempt.
- [x] 2.4 Confirm same-workspace and same-Pi-session Stage 2 invocation; persist the transcript outside the workspace and fail closed on resume failure.
- [x] 2.5 Confirm whether the existing oracle Practice is reusable after a Stage 2 leakage audit, or requires a new version.
- [x] 2.6 Confirm the irrelevant Practice and its length-balance limit.
- [x] 2.7 Confirm the pre-registered saturation threshold and directional-screen stability rule; proposed default is 80%.
- [x] 2.8 Confirm that later model pilot repetition and analysis rules require a separate explicit authorization outside this change.

## 3. Contracts and schemas

- [x] 3.1 Define the versioned two-stage profile contract, including conditions, Practice references, stage prompts, stage budgets, snapshot policy, and decision/saturation metadata.
- [x] 3.2 Define the staged diagnostic plan contract and its identity fields.
- [x] 3.3 Define the Stage 1 snapshot manifest format, excluded generated paths, canonical ordering, per-file hashes, and tree hash.
- [x] 3.4 Define the deterministic two-stage evaluator result contract with per-check state, reasons, raw metrics, semantic results, and no weighted score.
- [x] 3.5 Add schema validation tests for malformed, incomplete, ambiguous, and escaping declarations.

## 4. Staged diagnostic runner

- [x] 4.1 Add profile resolution that reuses three-condition Practice isolation without modifying `injection-calibration/v1/v2`.
- [x] 4.2 Add staged plan parsing, candidate identity checks, dry-run validation, and planned-denominator reporting.
- [x] 4.3 Add Stage 1 workspace provisioning with only the declared Stage 1 prompt, starter, and condition-scoped Practice delivery.
- [x] 4.4 Add Stage 1 execution, semantic gate, snapshot creation, and fail-closed snapshot verification.
- [x] 4.5 Add Stage 2 prompt replacement, snapshot immutability check, dependency-input verification, and same-session invocation.
- [x] 4.6 Add per-stage logs, redacted traces, execution-health states, and summaries that preserve planned denominators.
- [x] 4.7 Add runner tests using controlled command doubles for sequencing, failure, timeout, leakage, snapshot mutation, and dry-run behavior.

## 5. Deterministic structure evaluator

- [x] 5.1 Add a versioned AST/import/call/value-edge analyzer with role classification for handler, transport adapter, policy, ledger, and registry/config.
- [x] 5.2 Add Stage 1 -> Stage 2 diff classification and raw concentration metrics without a weighted score.
- [x] 5.3 Add deterministic checks for handler stability, transport isolation, policy continuity, ledger continuity, provider extension locality, and diff classifiability.
- [x] 5.4 Ensure equivalent layouts are accepted by executable structure rather than filenames or identifier names.
- [x] 5.5 Fail ambiguous classification as `indeterminate` with a redacted reason.
- [x] 5.6 Add evaluator tests for pass, fail, indeterminate, malformed source, snapshot mismatch, and semantic/structure separation.

## 6. v4 candidate and public/private materials

- [x] 6.1 Create the independent v4 candidate declaration, source identity, snapshot, runtime declaration, and execution policy.
- [x] 6.2 Create the Stage 1 public prompt, starter, docs, and public tests without Stage 2 leakage.
- [x] 6.3 Create the Stage 2 public prompt and stage it only through the runner.
- [x] 6.4 Create or select oracle and irrelevant Practice cards after leakage and length-balance audits.
- [x] 6.5 Create private Stage 1 and Stage 2 semantic evaluators that do not expose structure rules or scoring logic.
- [x] 6.6 Create the private oracle mapping that separates semantic completion from deterministic structure observation.

## 7. Offline calibration matrix

- [x] 7.1 Create at least seven private fixtures: oracle reference, equivalent reference, baseline scatter, anti-pattern, docs-only, public starter, and ambiguous source.
- [x] 7.2 Declare expected labels for semantic health, snapshot behavior, and every deterministic structure check.
- [x] 7.3 Add Stage 2 leakage audits over Stage 1 prompt, starter, docs, public tests, oracle Practice, and irrelevant Practice.
- [x] 7.4 Run the offline matrix with zero candidate-model calls and zero judge-model calls.
- [x] 7.5 Record per-fixture, per-check observed and expected labels plus explicit pass/fail classification.
- [x] 7.6 If any expected label mismatches, stop and preserve evidence; do not tune thresholds or fixtures to force separation.

## 8. Final offline gate

- [x] 8.1 Run focused runner, evaluator, profile, and calibration tests.
- [x] 8.2 Run `bun run test:contracts`.
- [x] 8.3 Run `bun run validate`.
- [x] 8.4 Run `openspec validate llm-provider-gateway-v4-two-stage-structure --type change --strict`.
- [x] 8.5 Run public/private leakage, credential, endpoint, and protected-path audits.
- [x] 8.6 Run `git diff --check`.
- [x] 8.7 Confirm candidate model calls and judge model calls are zero.
- [x] 8.8 Confirm that no formal experiment, formal record, suite revision, generated workspace, log, `node_modules/`, or model transcript is committed.
- [x] 8.9 Update PR evidence with commands, outcomes, offline matrix summary, and explicit statement that passing offline calibration does not establish a Practice effect.

## 9. Review hardening

- [x] 9.1 Make the declared semantic oracle commands executable and cover both real CLI invocations without model calls.
- [x] 9.2 Remove private acceptance vocabulary from the Stage 2 agent-visible prompt and refresh candidate identity.
- [x] 9.3 Apply `schedule_seed` as the deterministic cyclic rotation input and test seed sensitivity plus balance.
- [x] 9.4 Bind runner prompt text and invocation prompt paths to the declared public prompt paths and fail execution health on mismatch.
