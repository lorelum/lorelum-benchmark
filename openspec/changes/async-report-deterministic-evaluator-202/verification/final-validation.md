# Final validation

- Planning base revision: `8edb1377b4991dcf76e9a4037fef80f17ee5076c`
- Reviewed head revision: `1f10f26316f6d598f8b7335525c1d6035fbb1f85`
- Nested evaluator snapshot id: `1efa42eb50c50b2303ed59db9ffd3cdb9240aefb563a97b20b39908b6d5cf109`
- Package snapshot id: `48eba718b6b905cf77b3a85a4a1bea591d5cbe7af11b0bd79981655dc985f428`
- Candidate snapshot id: `ee588de3877ab91f2c1dfe8219bb7f9834671dd2a275531485f9d0630e0165d2`

## Commands

| Command | Result |
| --- | --- |
| `bun run calibration/run.ts` | 12/12 fixtures passed the complete nine-check oracle matrix |
| `bun test checks.test.ts result.test.ts identity.test.ts harness.test.ts summary.test.ts` | 21 pass, 0 fail |
| `bun test cli.test.ts` | 2 pass, 0 fail; condition metadata rejected and environment variants produced identical results |
| `bun run leakage-audit.ts` | `{"leakage_audit":"pass"}` |
| `bun run evaluate.ts <public-starter-app>` | exit code 1; `fail`; only overlap and rollback failed |
| `bun run validate` | layout valid; snapshots intact |
| `openspec validate async-report-deterministic-evaluator-202 --type change --strict --json` | valid |
| `bun run check:openspec-purpose -- origin/main` | passed; 0 changed stable specs |
| `bun test src/benchmark/runner/pi/v2/staged/staged-practice-delivery.test.ts` | 24 pass, 0 fail |
| `git diff --check` | no whitespace errors |

## Boundaries

- No model call, formal record, suite registration, or candidate lifecycle promotion was performed.
- `async-report-lifecycle-v1` public task/starter, `private/candidate.yaml`, and #196 `private/snapshot.json` remain unchanged.
- #197 staged runner, #199 treatments, and #200 JudgeAgent artifacts remain unchanged.
