## 1. OpenSpec and planning gate

- [x] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #92. (`openspec validate issue-92-practice-diagnostic-summary --type change --strict --json` passed; PR #159 created.)
- [x] 1.2 Confirm with the requirements owner: #91 corpus scope (which v3 summaries to include), quality-gap semantics (whether not-run/judge-unavailable become gaps), and output format (JSON + markdown report); record answers in `design.md` and this file before implementation. (Confirmed 2026-08-08: v2 dual candidates three-repeat + login retest-v2; keep v1 quality-gap {indeterminate}; JSON + markdown report; slot-replacement per #91 N2.)

## 2. Corpus driver

- [x] 2.1 Add `src/benchmark/result-interpreter/v1/adapters/practice-corpus.ts` (corpus manifest + slot-replacement consolidation) and `practice-corpus-report.ts`: accept a corpus manifest (list of v3 summary paths), map each through the practice adapter, interpret each, and emit per-summary `result-interpreter-summary/v1` plus a corpus-level aggregation (verdict distribution + execution gaps only). [Write scope: `src/benchmark/result-interpreter/v1/adapters/`]
- [x] 2.2 Add a redacted markdown report builder: per candidate × profile_input_hash verdict + evidence + raw counts; cross-candidate distribution; #75 historical section; #92 success/failure/uncertain close-out. [Write scope: `src/benchmark/result-interpreter/v1/adapters/`]
- [x] 2.3 Add focused tests: fixed-input isolation across multiple summaries, missing corpus entry → gap, unhealthy attempt → uncertain, aggregate uncertain, redaction (no private material in report), #75 separation, no weighted score. [Write scope: `src/benchmark/result-interpreter/v1/adapters/`]

## 3. #91 corpus replay and report

- [x] 3.1 Enumerate the #91 v3 corpus and run the driver over it; write the redacted summary + report under `scratch/`; list any missing/incomplete entries as gaps. (Replay: v2-full-run + v2-rerun-pdir slot replacement + login-v2-three-condition-retest-v2; output under `scratch/result-interpreter/issue-91-corpus/`; profile-update v2 → signal, pdir v2 → signal, login → uncertain; no missing entries beyond listed gaps.)
- [x] 3.2 Apply the strict decision rule per unit and record per-candidate conclusions with evidence; mark overall uncertain when gaps exist. (Per-unit verdicts + evidence chain recorded in corpus-report.json / report.md; overall uncertain due to login execution gap.)

## 4. Verification

- [x] 4.1 Run focused tests, `bun run validate`, OpenSpec strict validation, `git diff --check`, and public/private leakage audit; retain evidence in the PR. (35/35 focused tests passed; `bun run validate` OK; OpenSpec strict valid; `git diff --check` clean.)
- [x] 4.2 Confirm no model invocation, no formal run manifest/record/suite revision, and no modification to `result-interpreter/v1` core, the practice adapter, or runner logic. (No model invocation; only additive corpus driver files + manifest.)