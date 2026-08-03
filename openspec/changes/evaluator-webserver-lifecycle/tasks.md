## 1. OpenSpec and planning gate

- [x] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #134. (`openspec validate evaluator-webserver-lifecycle --type change --strict` passed; PR #140)
- [x] 1.2 Confirm with the requirements owner: dynamic port + controlled supervisor vs Playwright built-in webServer dynamic port; failure classification (existing `execution-failed` enum + stable error categories vs a new status). Record answers in this change's design. (Confirmed: dynamic port + supervisor; existing `execution-failed` + stable categories; no issue comment.)

## 2. Process-tree cleanup helper

- [x] 2.1 Extract a shared process-tree termination helper (Windows `taskkill /T /F`; Linux recursive pgrep + SIGTERM) used by `preflight.ts` `run` and the evaluator supervisor; reuse the already-verified `execute.ts`/`coordinator.ts` logic without changing frozen runner behavior. [Write scope: `src/benchmark/runner/pi/v2/`]
- [x] 2.2 Add focused tests for timeout cleanup on Windows/Linux paths, normal-exit cleanup, and cleanup-unconfirmed classification. [Write scope: `src/benchmark/runner/pi/v2/`]

## 3. Evaluator WebServer lifecycle

- [x] 3.1 Implement per-attempt isolated WebServer (dynamic port + controlled supervisor by default): allocate free port, launch server, poll readiness, inject server URL to evaluator, and terminate server tree in `finally`. [Write scope: `src/benchmark/runner/pi/v2/`]
- [x] 3.2 Map launch/dependency/timeout/cleanup failures to stable redacted categories on `evaluation_status=execution-failed`; never emit semantic/Practice/joint-pass from a failed startup. [Write scope: `src/benchmark/runner/pi/v2/`]
- [x] 3.3 Add tests: consecutive-attempt port isolation, server launch failure, evaluator timeout cleanup, unconfirmed cleanup blocks comparison. [Write scope: `src/benchmark/runner/pi/v2/`]

## 4. Verification and evidence

- [x] 4.1 Run `bun run test:pi:v2`, `bun run validate`, OpenSpec strict validation, and `git diff --check`; record command outcomes and omissions in the PR. (test:pi:v2 71/71, validate passed, strict validation passed, diff --check passed.) [Execution scope: repo-wide]
- [x] 4.2 Confirm candidate `public/starter/app` files and snapshots are unchanged, no model call or record was created, and no frozen helper or #91/#125 result was modified; check off completed tasks immediately. (Local end-to-end evidence, scratch only, deleted afterwards: 3 supervisor rounds on distinct ports 8833/8855/8892 all ready and port-released after stop; one real evaluator run on port 8911 with `PLAYWRIGHT_BASE_URL` exit 0, 1 passed, cleanup confirmed; two consecutive full evaluator attempts on ports 7792/4846 both exit 0 with cleanup confirmed, no port conflict or residue.)