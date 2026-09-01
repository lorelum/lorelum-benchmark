# Design

## Context

#182 / PR #184 established that practice-aware LLM judging is not a reliable primary discriminability signal. The structure-fact extraction contract remained schema-valid, but abstract ownership, centralization, and scattering facts were unstable; partial labels and baseline scatter did not calibrate. The result remains `diagnostic-only / calibration failed`, and PR #184 is closed without merge.

The current `profile-diagnostic-runner` executes one Pi attempt, one public prompt, and one evaluator pass. `injection-calibration/v2` already provides useful three-condition Practice isolation and `project-convention/v1` delivery, but it has no stage concept, no Stage 1 snapshot, and no deterministic Stage 1 -> Stage 2 diff contract. The v3 structural probe is a useful source-level precedent, but it is single-stage and must not be modified.

## Goals / Non-Goals

**Goals:**

- Introduce an independent `llm-provider-gateway-v4` candidate with separate public/private identity.
- Execute Stage 1 and Stage 2 in the same app workspace, while preventing Stage 2 from appearing in Stage 1 input.
- Snapshot Stage 1 output outside the agent workspace and keep it immutable through Stage 2.
- Preserve the existing three conditions: baseline, oracle-practice, and irrelevant-practice.
- Use deterministic AST, import graph, call/value edge, and diff classification as the primary structure signal.
- Provide an offline fixture matrix that verifies every deterministic check independently.
- Preserve ambiguous evidence as `indeterminate` rather than coercing it to pass or fail.
- Pre-register saturation and no-discriminability handling before any authorized model pilot.

**Non-Goals:**

- Do not repair or extend PR #184 or the practice-aware judge.
- Do not use an LLM judge as the primary pass/fail signal.
- Do not create a weighted architecture score.
- Do not modify v1/v2/v3 candidates, frozen revisions, treatments, environments, or historical records.
- Do not run candidate models, judge models, formal experiments, or create formal records in this change.
- Do not upgrade suite revision or promote the candidate into an active suite.

## Decisions

### Independent v4 candidate and staged profile

Create `incubator/practice-injection/llm-provider-gateway-v4/` with its own source commit, snapshot, profile, conditions, evaluator, and calibration identity. Introduce a new versioned two-stage Practice profile instead of extending `injection-calibration/v2`. The new profile may reuse the v2 resolver's Practice hash, length, and condition-isolation concepts, but v2 files and behavior remain unchanged.

### Stage 1 and Stage 2 boundaries

Stage 1 exposes only the initial functional requirements and public tests needed to build an initial implementation. Stage 2 exposes a maintenance change that preserves the public API and accounting semantics while adding a provider whose wire protocol differs from the existing provider.

Stage 1 and Stage 2 run in the same app workspace and continue the exact same Pi session. Stage 2 therefore observes both the Stage 1 artifact and the Stage 1 conversation state. The runner stores the transcript outside the workspace, replaces the prompt before Stage 2, and audits that Stage 2 was not materialized in Stage 1. The runner must bind each supplied prompt text and invocation prompt path to the profile-declared public prompt path; a mismatch fails execution health before model invocation. Agent-visible stage prompts may reference only public workspace material, not private acceptance artifacts.

### Stage 1 snapshot

After Stage 1 Pi succeeds and Stage 1 semantic checks pass, the runner creates an immutable snapshot in the attempt artifact area. The snapshot records canonical per-file SHA-256 hashes and a canonical tree hash, excludes generated files such as `node_modules/`, `.git/`, logs, and test output, and is never copied into the agent workspace. Stage 2 may proceed only after the snapshot verifies and may not mutate it. Snapshot loss or hash mismatch is an execution-health failure, not a structural fail.

### Practice delivery and leakage guard

Use `project-convention/v1` so the condition-scoped Practice document exists from Stage 1 and remains available in Stage 2. The baseline workspace must not contain a Practice document. Public traces may record only Practice id, version, delivery template, target path, and SHA-256. Before implementation, the selected oracle and irrelevant Practice texts must be audited so neither reveals the Stage 2 provider, maintenance request, evaluator labels, or scoring logic. If the existing oracle Practice leaks Stage 2, create a new Practice version rather than changing an old revision.

### Deterministic structure observation

Build a new versioned evaluator helper rather than modifying the v3 probe. Classification uses TypeScript AST, relative imports, value edges, and data-flow evidence rather than file names or identifiers. Handler, transport adapter, policy, ledger, and registry roles must be inferred from executable behavior. `import type` alone, unused imports, or name similarity do not establish a structural edge.

Primary results are per-check `pass`, `fail`, or `indeterminate`, plus raw concentration metrics. There is no weighted structure score. `structure_pass` is true only when Stage 1 semantics pass, Stage 2 semantics pass, the Stage 1 snapshot is valid, and every structural check passes. Parser or classification ambiguity is `indeterminate`; snapshot integrity failure is execution unhealthy.

### Offline-first validation

Before any model call, calibrate a private matrix with at least oracle reference, equivalent layout, baseline scatter, anti-pattern, docs-only, public starter, and ambiguous source. Expected labels are declared per check rather than as one aggregate score. Equivalent implementations must pass even when file names or module layout differ; functional but scattered implementations must not pass merely because tests pass.

### Saturation and decision handling

Record complete planned denominators and unhealthy or indeterminate attempts separately. A later authorized model pilot may report `directional-screen` only when oracle-practice exceeds both controls on Stage 2 structure checks, semantic health does not collapse, concentration metrics agree with the pass signal, and stability holds across repeats. If baseline and oracle both almost completely pass, record `saturated / no discriminability`. Do not tune thresholds, change fixtures, add judge prompts, or interpret a lucky sample as an effect.

## Risks / Trade-offs

- [Stage 2 leaks through starter docs, tests, or Practice text] -> Add static audits over all Stage 1-visible files and reject provider-specific Stage 2 terms and evaluator concepts.
- [Equivalent layouts are rejected by filename heuristics] -> Classify roles from AST and executable edges; prohibit filename-based pass/fail.
- [Snapshot mutation or unstable hashes] -> Put snapshots outside the workspace, exclude generated files, and fail execution health on any hash mismatch.
- [Ambiguous ASTs become false failures] -> Preserve `indeterminate`, keep planned denominators, and never treat ambiguity as Practice failure.
- [Baseline saturates the structural task] -> Pre-register saturation handling; stop rather than tune thresholds or fixtures.
- [Stage 2 is too broad and causes rewrites even for good structures] -> Scope the maintenance change to a provider addition that preserves the public API and accounting semantics; verify concentration with focused fixtures before models.

## Migration Plan

1. Create and strictly validate OpenSpec artifacts on a branch from latest `origin/main`.
2. Create the initial OpenSpec-only PR referencing #185.
3. Enter planning clarification and record answers in issue #185, this design, and tasks before implementation.
4. After confirmation, implement schemas, profile, runner, evaluator, candidate, offline fixtures, and tests on the same branch and PR.
5. Run focused tests, `bun run validate`, OpenSpec strict validation, leakage and protected-path audits, and `git diff --check`.
6. Keep candidate model calls at zero; any model pilot requires a separate explicit authorization and must not create formal records.

Rollback before merge removes the new OpenSpec artifacts only. No historical candidate, frozen revision, record, or shared judge contract is affected.

## Planning Confirmation

2026-08-29, the requester confirmed all implementation gates recorded in [#185](https://github.com/lorelum/lorelum-benchmark/issues/185#issuecomment-5461471038): the stage scopes, 15 + 15 minute model budgets, same-workspace/same-session Stage 2 with fail-closed resume, audit-first Practice reuse, 80% saturation threshold, majority pair-block directional rule, and the zero-model-call boundary for this change.

## Open Questions / Planning Gate

The following must be answered by the requester and written back to issue #185, design, and tasks before candidate fixture, runner, or evaluator implementation:

1. Confirmed Stage 1 scope: single provider, chat, retry, and basic usage/billing.
2. Confirmed Stage 2 scope: add a different-wire-protocol provider while preserving public API, usage, and billing semantics.
3. Confirmed 15 minutes of model execution per stage; offline evaluator time is excluded from stage model budgets.
4. Confirmed same-workspace, same-Pi-session Stage 2 invocation; resume failure is execution unhealthy and must not downgrade to no-session.
5. Confirmed audit-first Practice policy: reuse the existing oracle Practice only after a Stage 2 leakage audit; derive a new version if it leaks.
6. Confirmed the pre-registered saturation threshold as 80%.
7. Confirmed directional-screen stability as strict rate improvement over each control plus majority pair-block advantage; pilot repetition remains a separately authorized decision.

### Review hardening

The declared semantic oracle commands execute from the candidate root with positional stage arguments. The staged cyclic Latin square consumes `schedule_seed` as a deterministic rotation input while preserving per-candidate condition balance.
