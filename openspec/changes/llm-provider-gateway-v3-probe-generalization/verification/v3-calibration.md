# v3 Structure Probe Calibration

## Execution

Command:

```text
bun run src/benchmark/kernel/kernel.ts calibrate incubator/practice-injection/llm-provider-gateway-v3 --output <empty-temp>
```

Result: `calibration-matrix` exit code 0, passed.

The kernel staged the private `quality-probe/v3` fixtures and public starter, resolved the locked evaluator TypeScript runtime, and executed `bun run test` plus `verify-provider-gateway-v3.ts` for every fixture. No model or real provider network was called.

## Matrix

| Fixture | Expected | Human review evidence |
| --- | --- | --- |
| public-starter | fail / not-observed | True placeholder starter retains direct OpenAI path and lacks the declared boundary responsibilities. |
| reference | pass / observed | Non-transport policy/ledger modules own retry/fallback, budget, idempotency, metering, aggregation, and JSONL persistence. |
| equivalent | pass / observed | Equivalent responsibilities use different directories and symbols. |
| type-based | pass / observed | Type-based contract variant preserves the same boundary ownership. |
| anti-pattern | pass / not-observed | Provider branching and provider-specific policy/cost paths remain scattered. |
| docs-present | pass / not-observed | Practice text is present, but implementation responsibilities remain scattered. |
| oracle-naming-variant-a | pass / observed | Derived from #168 oracle rep1: centralized `Gateway` methods use `tryReserve`, `settle`, `makeRecord`, and `logRecord` without the reference vocabulary. |
| oracle-naming-variant-b | pass / observed | Derived from #168 oracle rep3: centralized `recordUsage` and execution policies use a different layout and vocabulary. |
| different-layout | pass / observed | Reference-equivalent boundary modules are nested under a different directory. |
| irrelevant-naming-collision | pass / not-observed | Derived from #168 irrelevant rep1: `reserveBudget`, `settleBudget`, and `retryAttempts` occur, but retry/fallback orchestration and metering remain inline in the route handler. |
| unused-boundary-modules | pass / not-observed | Handler imports structurally complete policy and ledger modules, but never calls their exported values; transitive import reachability alone is not an execution edge. |
| baseline-policy-scatter | pass / not-observed | Derived from #168 baseline attempt-2: retry/fallback is extracted, but budget/idempotency/metering remain scattered and the executor has no shared policy state or ledger delegation. |
| oracle-sync-ledger | pass / observed | Derived from #168 oracle attempt-2: gateway owns synchronous record write, filtered aggregation, and `appendFileSync` persistence in one non-transport module. |
| ledger-naming-variant | pass / observed | Record persistence, reads, and aggregation use renamed symbols while remaining in one non-transport module. |

Labels were fixed by source review; #168 judge v2 rationale was used only as corroborating evidence. Expected labels are calibration assertions only and are never passed to the probe. The probe reports structural evidence paths and function names (for example policy module/function and ledger module), not identifier-allowlist matches. The deterministic matrix now has 14 cases: 2 extra real PI-derived regressions from the historical v2 replay, plus the public starter.

## Judge Boundary

The final diff does not modify `judge-agent/generic/v2` or add a shared judge capability delta. The v3 candidate still declares the frozen `judge-agent/generic/v2` as a soft sidecar, but judge scoring does not contribute to semantic or `practice_observation`.

Generic judge evidence-rationale hardening and naming-variant judge calibration are deferred to #174 because `generic/v2` is already used by frozen candidates. Approved real judge calibration was not completed. Two later diagnostic kernel invocations unexpectedly inherited judge credentials from repository `.env` and reached the judge API; both stopped at fail-closed validation errors, the exact request count was not logged, and neither result is calibration evidence. The v3 candidate declares no automatic judge calibration role.
