## 1. OpenSpec and planning gate

- [x] 1.1 Strictly validate this change and create the initial OpenSpec-only PR linked to #130. (`openspec validate ... --strict` passed; PR #131)
- [ ] 1.2 Record the confirmed isolated probe flags, finite allowance, unchanged model/prompt/attempt budget, and scratch-only re-admission boundary in #130 and this change before implementation.

## 2. Isolated preflight

- [ ] 2.1 Restrict the Pi/model availability probe to non-persistent, tool-free, context-free, Skill-free, and extension-free execution with a bounded normal-startup allowance. [Write scope: `src/benchmark/runner/pi/v2/preflight.ts`]
- [ ] 2.2 Preserve redacted fail-closed classification and ensure a timed-out probe cannot proceed to candidate workspace creation or model attempts. [Write scope: `src/benchmark/runner/pi/v2/preflight.ts`, `src/benchmark/runner/pi/v2/profile-diagnostic-runner.ts`]

## 3. Regression evidence

- [ ] 3.1 Add focused controlled-Pi tests for the restricted arguments, successful delayed probe, timeout classification, and no project-file mutation. [Write scope: `src/benchmark/runner/pi/v2/`]
- [ ] 3.2 Run focused Pi v2 tests, `bun run validate`, strict OpenSpec validation, a public/private leakage audit, and `git diff --check`.
- [ ] 3.3 After the repair is merged, rerun #129's authorized scratch-only one-repeat gate; do not create a formal manifest or record and do not use the result for an effect claim.
