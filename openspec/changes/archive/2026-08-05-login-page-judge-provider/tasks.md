## 1. OpenSpec and planning gate

- [x] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #146. (`openspec validate login-page-judge-provider --type change --strict` passed)
- [x] 1.2 Record planning decisions: provider declared in `conditions.yaml` `shared_execution.judge.provider` (default `practice-layered-api/v2`; no fallback — not-run when absent); SourceMap = workspace/app files minus generated dirs, sorted; indeterminate budget default 0.25.

## 2. SourceMap contract and provider [write scope: `src/benchmark/judge/`]

- [x] 2.1 Add `src/benchmark/judge/source-map.ts`: `sourceMapFromWorkspace` (exclude generated dirs, sorted keys), `sourceMapToDiff`, `sourceMapFromDiff` (canonical `path\0<length>\0<content>` `\n`-joined; length prefix keeps content newlines unambiguous).
- [x] 2.2 Add `src/benchmark/judge/providers.ts` registry (mock + practice-layered-api/v2) and the `practice-layered-api/v2` provider wrapping the shared scorer (`scoreSourceV2`), returning `judge-result/v1`; keep `mock-judge` default.

## 3. Runner wiring [write scope: `src/benchmark/runner/pi/v2/profile-diagnostic-runner.ts`]

- [x] 3.1 After evaluation, resolve the candidate-declared judge provider, build the SourceMap/diff, run the provider, write `judge.sidecar.json`, and add redacted judge fields to the entry and summary (condition-level observed/indeterminate counts + criterion table).
- [x] 3.2 Declare `judge.provider: practice-layered-api/v2` (and budget) in `login-page-auth-flow-v2` conditions.yaml.

## 4. Indeterminate protocol and plan template

- [x] 4.1 Document the indeterminate denominator preservation + budget (default 0.25) and the frozen-plan requirements (rubric hash, criterion table, repetitions) in the change docs and runner summary.
- [x] 4.2 Implement the indeterminate budget gate in the judge summary: per-condition indeterminate rate (indeterminate / judged attempts) exceeding the declared budget marks the condition and summary `diagnostic_only`; unit tests cover exceed/within-budget cases.

## 5. Tests and validation

- [x] 5.1 Contract tests: source-map determinism, provider sidecar shape/redaction, runner wiring (sidecar file + summary fields), indeterminate budget; reuse input redaction audit.
- [x] 5.2 End-to-end provider smoke on a v5/v6 candidate output: runner provider result equals directly calling `scoreSourceV2`.
- [x] 5.3 `bun run validate`, OpenSpec strict validation, `git diff --check`; confirm v1 judge/logic and historical results untouched, no model call, no formal record.
