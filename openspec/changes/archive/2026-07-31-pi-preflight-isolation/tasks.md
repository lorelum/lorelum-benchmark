## 1. OpenSpec and planning gate

- [x] 1.1 Strictly validate this change and create the initial OpenSpec-only PR linked to #130. (`openspec validate ... --strict` passed; PR #131)
- [x] 1.2 Record the confirmed isolated probe flags, finite allowance, unchanged model/prompt/attempt budget, and scratch-only re-admission boundary in #130 and this change before implementation. (Confirmed by requester; recorded in #130.)

## 2. Isolated preflight

- [x] 2.1 Restrict the Pi/model availability probe to non-persistent, tool-free, context-free, Skill-free, and extension-free execution with a bounded normal-startup allowance. [Write scope: `src/benchmark/runner/pi/v2/preflight.ts`]
- [x] 2.2 Preserve redacted fail-closed classification and ensure a timed-out probe cannot proceed to candidate workspace creation or model attempts. [Write scope: `src/benchmark/runner/pi/v2/preflight.ts`, `src/benchmark/runner/pi/v2/profile-diagnostic-runner.ts`]

## 3. Regression evidence

- [x] 3.1 Add focused controlled-Pi tests for the restricted arguments, successful delayed probe, timeout classification, and no project-file mutation. [Write scope: `src/benchmark/runner/pi/v2/`]
- [x] 3.2 Run focused Pi v2 tests, `bun run validate`, strict OpenSpec validation, a public/private leakage audit, and `git diff --check`. (`bun run test:pi:v2` 63 pass; `bun run validate` passed; public workspace audit passed.)
