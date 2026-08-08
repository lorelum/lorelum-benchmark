## 1. OpenSpec and planning gate

- [x] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #155. (`openspec validate issue-155-global-result-interpreter --type change --strict --json` passed; PR #157 created.)
- [x] 1.2 Confirm with the requirements owner: neutral attempt contract fields, decision-rule-as-data semantics, channel-neutrality verification scope, private/redaction boundary, and versioning of `result-interpreter/v1`; record the answers in `design.md` and this file before implementation. (Confirmed 2026-08-08: strict-greater-than-each-control; synthetic-only channel-neutrality fixtures; per-unit + distribution summary; `result-interpreter/v1` naming; additive helper without touching `outcome/v1` or runner summary logic.)

## 2. Neutral contract and core

- [x] 2.1 Add `src/benchmark/result-interpreter/v1/types.ts`: sample-unit identity, planned denominator, neutral attempt entry reusing `outcome/v1` health/semantic/quality, redacted trace, exceptions, data-driven DecisionRule, Verdict, and audited summary types. [Write scope: `src/benchmark/result-interpreter/v1/`]
- [x] 2.2 Add `src/benchmark/result-interpreter/v1/interpret.ts`: group by sample unit; identity gate (source_commit/snapshot_id/input_hash consistency), denominator gate (planned vs present), redaction gate (reject unknown/private fields, fail closed), decision-rule application (per-condition joint-pass counts; strict greater than each control → signal), verdict computation with reasons, and summary builder with per-unit evidence and cross-unit diagnostic distribution only. [Write scope: `src/benchmark/result-interpreter/v1/`]
- [x] 2.3 Add `src/benchmark/result-interpreter/v1/interpret.test.ts`: practice-like (baseline/oracle-practice/irrelevant-practice) and skill-like (baseline/skill) fixtures through the same core; coverage for channel neutrality, unit isolation (different input_hash never combined), identity drift → uncertain, denominator gap → uncertain, indeterminate quality → uncertain, strict lead → signal, no strict lead → diagnostic-only, private-field rejection fail-closed, and redacted output without weighted scores. [Write scope: `src/benchmark/result-interpreter/v1/`]

## 3. Verification

- [x] 3.1 Run focused tests, `bun run validate`, OpenSpec strict validation, `git diff --check`, and public/private leakage audit; retain evidence in the PR. (14/14 focused tests passed; `bun run validate` OK; OpenSpec strict valid; `git diff --check` clean.)
- [x] 3.2 Confirm no model invocation, no formal run manifest/record/suite revision, and no modification to `outcome/v1` or the runner summary logic used by #90/#91 (`profile-diagnostic-summary/v3` remains compatible). (No model invocation; no manifest/record/revision; only additive `result-interpreter/v1` files added.)
