## 1. OpenSpec and planning gate

- [ ] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #92. (`openspec validate issue-92-practice-diagnostic-summary --type change --strict --json` passed; PR created.)
- [ ] 1.2 Confirm with the requirements owner: #91 corpus scope (which v3 summaries to include), quality-gap semantics (whether not-run/judge-unavailable become gaps), and output format (JSON + markdown report); record answers in `design.md` and this file before implementation.

## 2. Corpus driver

- [ ] 2.1 Add `src/benchmark/result-interpreter/v1/adapters/practice-corpus-report.ts`: accept a corpus manifest (list of v3 summary paths), map each through the practice adapter, interpret each, and emit per-summary `result-interpreter-summary/v1` plus a corpus-level aggregation (verdict distribution + execution gaps only). [Write scope: `src/benchmark/result-interpreter/v1/adapters/`]
- [ ] 2.2 Add a redacted markdown report builder: per candidate × profile_input_hash verdict + evidence + raw counts; cross-candidate distribution; #75 historical section; #92 success/failure/uncertain close-out. [Write scope: `src/benchmark/result-interpreter/v1/adapters/`]
- [ ] 2.3 Add focused tests: fixed-input isolation across multiple summaries, missing corpus entry → gap, unhealthy attempt → uncertain, aggregate uncertain, redaction (no private material in report), #75 separation, no weighted score. [Write scope: `src/benchmark/result-interpreter/v1/adapters/`]

## 3. #91 corpus replay and report

- [ ] 3.1 Enumerate the #91 v3 corpus and run the driver over it; write the redacted summary + report under `scratch/`; list any missing/incomplete entries as gaps. [Execution scope: `scratch/`]
- [ ] 3.2 Apply the strict decision rule per unit and record per-candidate conclusions with evidence; mark overall uncertain when gaps exist. [Execution scope: `scratch/`]

## 4. Verification

- [ ] 4.1 Run focused tests, `bun run validate`, OpenSpec strict validation, `git diff --check`, and public/private leakage audit; retain evidence in the PR.
- [ ] 4.2 Confirm no model invocation, no formal run manifest/record/suite revision, and no modification to `result-interpreter/v1` core, the practice adapter, or runner logic.