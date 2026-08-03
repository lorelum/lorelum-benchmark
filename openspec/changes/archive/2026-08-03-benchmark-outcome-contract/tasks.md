## 1. OpenSpec and planning gate

- [x] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #132. (`openspec validate benchmark-outcome-contract --type change --strict` passed; PR #138)
- [x] 1.2 Confirm with the requirements owner: JudgeAgent result expression (new schema version vs sidecar), execution health `indeterminate` adoption scope, joint_pass derivation rule, and raw-score preservation requirements; record the answers in this change's design. (Confirmed: sidecar `judge-result/v1`; `indeterminate` new-contract only; `joint_pass` derived from quality `observed`; no issue comment.)

## 2. Outcome contract artifacts

- [x] 2.1 Add the repository-level outcome contract section to `docs/BENCHMARK_PROTOCOL.md` defining execution health (success/failure/indeterminate), semantic hard gate, quality soft metric states (including `judge-unavailable`), derived `joint_pass`, and raw-score preservation. [Write scope: `docs/BENCHMARK_PROTOCOL.md`]
- [x] 2.2 Align `docs/PRACTICE_BENCHMARK_GUIDE.md` with the repository-level contract: quality signals and `judge-unavailable` are independent soft metrics; `joint_pass` is derived only; no hidden weighted total. [Write scope: `docs/PRACTICE_BENCHMARK_GUIDE.md`]
- [x] 2.3 Update `docs/PI_RUNNER.md` evaluator-result contract notes to point at the new outcome contract and any new schema/sidecar. [Write scope: `docs/PI_RUNNER.md`]

## 3. Schema and evaluator contract

- [x] 3.1 Decide and implement the JudgeAgent result expression confirmed in 1.2: either a new schema version or an independent sidecar schema (default recommendation: sidecar such as `judge-result/v1`); never silently extend `evaluator-result/v2`. [Write scope: `schemas/`]
- [x] 3.2 Add JSON Schema tests covering execution health states, quality states including `judge-unavailable`, derived `joint_pass`, raw score preservation, and rejection of hidden weighted totals. [Write scope: `src/benchmark/`]
- [x] 3.3 Add focused contract-helper tests proving non-healthy and `indeterminate` attempts stay in planned denominators without entering pass/observation numerators; wiring into the real summary/record pipeline is out of scope (see design Enforcement Boundary). [Write scope: `src/benchmark/`]

## 4. Verification and evidence

- [x] 4.1 Run `bun run test:pi:v2`, `bun run validate`, schema tests, and OpenSpec strict validation; record command outcomes and any omissions in the PR. (test:pi:v2 67/67, test:contracts 83/83, validate passed, strict validation passed.)
- [x] 4.2 Run public/private leakage audit and `git diff --check`; confirm no model call, candidate change, snapshot, record, or frozen-helper rewrite was introduced.
- [x] 4.3 Check off completed tasks in `tasks.md` immediately after each task passes.
