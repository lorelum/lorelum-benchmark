## 0. Planning Gate

- [x] 0.1 After the initial OpenSpec-only PR passes strict validation, confirm
  with the requirements owner and write back to Issue #100 and this
  design/tasks: observable behavior versus Practice behavior; expected
  baseline defect and discrimination; relevant Practice and equal-length
  irrelevant control; private semantic and quality acceptance; starter and
  immutable source commit; model, prompt, budget, and blind-review boundaries.
- [x] 0.2 Resolve the first-consumer contract details: authoritative control
  length metric/tolerance, private injection API and redacted trace fields,
  decision-rule strictness, and the #89 consumer's source pin. Do not implement
  a candidate fixture before these answers are recorded.

## 1. Profile Runtime

- [x] 1.1 Add a versioned `injection-calibration/v1` private condition parser
  and validator outside kernel core. Reject malformed, duplicate, incomplete,
  or unsupported condition declarations. [Write scope: `src/benchmark/`]
- [x] 1.2 Add condition-scoped private Practice payload resolution with
  SHA-256 verification and redacted trace metadata. [Write scope:
  `src/benchmark/`]
- [x] 1.3 Add profile-owned equal-length-control arithmetic and declarative
  decision-rule validation without interpreting candidate semantics. [Write
  scope: `src/benchmark/`]

## 2. Resolved Inputs

- [x] 2.1 Add a profile-input hash to kernel-backed Practice resolved snapshots
  without exposing Practice text or private paths. [Write scope:
  `src/benchmark/`]
- [x] 2.2 Extend generated-output hygiene for local Practice runtime output;
  do not modify #75 historical candidate inputs or #89 candidate fixtures.
  [Write scope: `.gitignore`, `src/benchmark/`]

## 3. Neutral Verification

- [x] 3.1 Add a neutral private profile fixture proving condition routing,
  hash-mismatch rejection, workspace isolation, control measurement validation,
  and decision-rule preservation. [Write scope: `src/benchmark/`]
- [x] 3.2 Add focused tests for profile-input snapshot invalidation and frozen
  task compatibility. [Write scope: `src/benchmark/`]

## 4. Validation And Handoff

- [x] 4.1 Run focused profile/snapshot tests, `bun run validate`, strict
  OpenSpec validation, and the public/private leak audit. Document evidence and
  non-executed model boundaries in the same PR.
- [ ] 4.2 Hand the merged profile contract to #89 / PR #97 without moving or
  duplicating its candidate evidence chain. Do not invoke Pi, a model provider,
  retrieval, or create records in this change.
