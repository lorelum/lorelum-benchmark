## 1. OpenSpec and planning gate

- [ ] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #133. (`openspec validate judgeagent-soft-scoring --type change --strict`)
- [ ] 1.2 Confirm with the requirements owner: judge-result/v1 in-place extension vs new v2, rubric reference placement, and sidecar artifact reference; record answers in this change's design.

## 2. Judge result contract

- [ ] 2.1 Extend `schemas/judge-result-v1.schema.json` (or add v2 per confirmation) with required provenance: judge model/version, prompt hash, rubric hash, input hash, state, dimension scores, rationale, confidence; keep `evaluator-result/v2` untouched. [Write scope: `schemas/`]
- [ ] 2.2 Update `src/benchmark/outcome/v1/contract.ts` (or a new versioned module) so `assertJudgeResultV1` enforces the expanded fields and fail-closed rules; extend focused tests. [Write scope: `src/benchmark/outcome/`]

## 3. Judge capability

- [ ] 3.1 Add `src/benchmark/judge/` provider interface, input constructor with allowlist and redaction, structured output validation, and failure classification; reject private/condition/Practice/Oracle/calibration input with redacted reasons. [Write scope: `src/benchmark/judge/`]
- [ ] 3.2 Add a deterministic mock provider that produces valid, provenance-complete results without network or model calls; real providers require explicit opt-in and are excluded from CI. [Write scope: `src/benchmark/judge/`]
- [ ] 3.3 Add focused tests: public-only input allowed, private input rejected, missing hash fails closed, invalid output fails closed, judge-unavailable vs not-observed, mock provider schema conformance. [Write scope: `src/benchmark/judge/`]

## 4. Docs and verification

- [ ] 4.1 Document the judge capability in `docs/BENCHMARK_PROTOCOL.md` and `docs/PI_RUNNER.md`: input allowlist, provenance, soft-signal-only boundary, mock-by-default. [Write scope: `docs/`]
- [ ] 4.2 Run `bun run test:contracts`, `bun run validate`, OpenSpec strict validation, and `git diff --check`; record command outcomes and omissions in the PR. [Execution scope: repo-wide]
- [ ] 4.3 Confirm no model call, candidate change, snapshot, record, or frozen-helper rewrite was introduced; check off completed tasks immediately.