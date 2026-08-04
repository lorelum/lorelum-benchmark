## 1. OpenSpec and planning gate

- [ ] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #136. (`openspec validate login-page-judge-rubric --type change --strict` passed; PR #xxx)
- [ ] 1.2 Confirm with the requirements owner: scoring repetition strategy (single / median-of-n / fixed small panel), anchor and discrimination tolerance, and low-confidence/disagreement reporting thresholds; record answers in this change's design without writing an issue comment.

## 2. Rubric artifact

- [ ] 2.1 Create the versioned login-page rubric at `incubator/practice-injection/login-page-auth-flow-v1/private/judge/rubric-v1.yaml` with dimensions `api-page-boundary`, `state-handling`, `form-experience`, `ui-ux` and max points; dimension descriptions MUST be structural/observable and path/name/helper-independent. [Write scope: `incubator/practice-injection/login-page-auth-flow-v1/private/judge/`]
- [ ] 2.2 Add rubric conformance validation (dimension ids, max_points, no fixed path/helper binding) and a stable rubric-hash check. [Write scope: `incubator/practice-injection/login-page-auth-flow-v1/private/judge/`]

## 3. Judge input redaction audit

- [ ] 3.1 Build the judge input bundle via `buildJudgeInput` from public-only material and assert it contains no condition, Practice, Oracle, or private evaluator markers and all paths resolve under a public root; record the audit evidence. [Write scope: `incubator/practice-injection/login-page-auth-flow-v1/private/judge/`]

## 4. Calibration matrix

- [ ] 4.1 Extend the candidate's private calibration sets with judge fixtures: reference, responsibilities-equivalent (different naming and directory), anti-pattern, and boundary; keep all fixtures and results private. [Write scope: `incubator/practice-injection/login-page-auth-flow-v1/private/calibration/`]
- [ ] 4.2 Run the offline calibration matrix with the deterministic mock provider; record anchor scores, reference-vs-equivalent tolerance, anti-pattern lower score with rationale, and boundary consistency. [Execution scope: `incubator/practice-injection/login-page-auth-flow-v1/private/calibration/`]

## 5. Judge tests and verification

- [ ] 5.1 Add focused tests: rubric conformance and stable hash, redaction fail-closed, mock provider schema conformance for login-page rubric, and disagreement-reporting shape. [Write scope: `src/benchmark/judge/`]
- [ ] 5.2 Run `bun run validate`, rubric/schema validation, redaction audit, and the offline calibration matrix; record command outcomes and omissions in the PR. [Execution scope: repo-wide]
- [ ] 5.3 Confirm no model call, no default-suite entry, no formal record, and no modification to the JudgeAgent engine or existing login-page candidate v1 results; check off completed tasks immediately.
