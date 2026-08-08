## 1. OpenSpec and planning gate

- [ ] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #155. (`openspec validate issue-155-global-result-interpreter --type change --strict --json` passed; PR created.)
- [ ] 1.2 Confirm with the requirements owner: neutral attempt contract fields, decision-rule-as-data semantics, channel-neutrality verification scope, private/redaction boundary, and versioning of `result-interpreter/v1`; record the answers in `design.md` and this file before implementation.

## 2. Neutral contract and core

- [ ] 2.1 Add `src/benchmark/result-interpreter/v1/types.ts`: sample-unit identity, planned denominator, neutral attempt entry reusing `outcome/v1` health/semantic/quality, redacted trace, exceptions, data-driven DecisionRule, Verdict, and audited summary types. [Write scope: `src/benchmark/result-interpreter/v1/`]
- [ ] 2.2 Add `src/benchmark/result-interpreter/v1/interpret.ts`: group by sample unit; identity gate (source_commit/snapshot_id/input_hash consistency), denominator gate (planned vs present), redaction gate (reject unknown/private fields, fail closed), decision-rule application (per-condition joint-pass counts; strict greater than each control → signal), verdict computation with reasons, and summary builder with per-unit evidence and cross-unit diagnostic distribution only. [Write scope: `src/benchmark/result-interpreter/v1/`]
- [ ] 2.3 Add `src/benchmark/result-interpreter/v1/interpret.test.ts`: practice-like (baseline/oracle-practice/irrelevant-practice) and skill-like (baseline/skill) fixtures through the same core; coverage for channel neutrality, unit isolation (different input_hash never combined), identity drift → uncertain, denominator gap → uncertain, indeterminate quality → uncertain, strict lead → signal, no strict lead → diagnostic-only, private-field rejection fail-closed, and redacted output without weighted scores. [Write scope: `src/benchmark/result-interpreter/v1/`]

## 3. Verification

- [ ] 3.1 Run focused tests, `bun run validate`, OpenSpec strict validation, `git diff --check`, and public/private leakage audit; retain evidence in the PR.
- [ ] 3.2 Confirm no model invocation, no formal run manifest/record/suite revision, and no modification to `outcome/v1` or the runner summary logic used by #90/#91 (`profile-diagnostic-summary/v3` remains compatible).
