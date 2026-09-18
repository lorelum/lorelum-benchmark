# Final validation

- Planning base revision: `8edb1377b4991dcf76e9a4037fef80f17ee5076c`
- Reviewed head revision: `6ae6bb7b64322c13a90d1d066f1d9d7182c2d6bb`
- Nested evaluator snapshot id: `7d68a9e9fc32a2fc96407ad1b4f6d416f6138cddc73587614be6b6d5e8db8be1`
- Package snapshot id: `9bb64efae32746457621b6c42c1f29035da22965e281048c2a9a73375950c5e4`
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
| `bun test src/benchmark/runner/pi/v2/staged` | 41 pass, 0 fail |
| `git diff --check` | no whitespace errors |

## Boundaries

- No model call, formal record, suite registration, or candidate lifecycle promotion was performed.
- `async-report-lifecycle-v1` public task/starter, `private/candidate.yaml`, and #196 `private/snapshot.json` remain unchanged.
- #197 staged runner, #199 treatments, and #200 JudgeAgent artifacts remain unchanged.
- GitHub CI on `6ae6bb7`: `workspace (ubuntu-latest)`, `workspace (windows-latest)`, `openspec-governance`, `changes`, and `required-validation` all pass.
