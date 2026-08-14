# Independent Verification Report

This report records a fresh-shell verification of the committed candidate files, performed after implementation and snapshot generation. The verification commands themselves do not use model calls or real provider networks.

## Commands

```text
bun test src/benchmark/judge/judge-agent/generic/v2/judge.test.ts
bun run src/benchmark/kernel/kernel.ts calibrate incubator/practice-injection/llm-provider-gateway-v3 --output <empty-temp>
bun run validate
```

## Results

- Judge v2 offline tests: 18 passed, 0 failed.
- v3 kernel calibration: `calibration-matrix` exit code 0, passed.
- Workspace validation: `Workspace layout is valid.` and `Snapshots are intact.`
- v3 public/private leak audit: no forbidden private, oracle, calibration, evaluator, condition, scoring, probe, hash, or joint-pass markers in `public/`.
- Frozen-object audit: no changes to `llm-provider-gateway-v1`, `llm-provider-gateway-v2`, suites, treatments, environments, records, or experiments.

## Boundary

Real judge calibration was not completed as an approved model-run artifact. Two diagnostic kernel invocations unexpectedly inherited repository judge credentials from `.env` and reached the judge API; the first failed while parsing generated rubric points, and the second failed the rationale gate while scoring. The exact request count was not logged, no calibration result was accepted, and neither response is used as evidence. The v3 candidate now declares no automatic judge calibration role, both implementation issues are covered by offline tests, and any future real judge calibration requires a separate issue and explicit authorization. These accidental invocations are a process breach that must remain visible instead of being absorbed into a no-model claim.
