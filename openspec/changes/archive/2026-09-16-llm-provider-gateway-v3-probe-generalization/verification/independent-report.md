# Independent Verification Report

This report records a fresh-shell verification of the committed candidate files, performed after implementation and snapshot generation. The verification commands themselves do not use model calls or real provider networks.

## Commands

```text
bun run src/benchmark/kernel/kernel.ts calibrate incubator/practice-injection/llm-provider-gateway-v3 --output <empty-temp>
bun run validate
```

## Results

- v3 kernel calibration: `calibration-matrix` exit code 0, passed.
- Workspace validation: `Workspace layout is valid.` and `Snapshots are intact.`
- v3 public/private leak audit: no forbidden private, oracle, calibration, evaluator, condition, scoring, probe, hash, or joint-pass markers in `public/`.
- Frozen-object audit: no changes to `llm-provider-gateway-v1`, `llm-provider-gateway-v2`, `judge-agent/generic/v2`, suites, treatments, environments, records, or experiments.
- Historical PI replay against the saved #168 v2 workspaces is an observational audit, not a target: baseline `0/3 observed`, oracle `3/3 observed`, irrelevant `0/3 observed`. Each oracle attempt was source-audited against the declared Practice; the probe itself never reads condition ids or expected labels.

## Boundary

Real judge calibration was not completed as an approved model-run artifact. Two diagnostic kernel invocations unexpectedly inherited repository judge credentials from `.env` and reached the judge API; the first failed while parsing generated rubric points, and the second failed the rationale gate while scoring. The exact request count was not logged, no calibration result was accepted, and neither response is used as evidence. The v3 candidate declares no automatic judge calibration role. Generic judge hardening is deferred to #174, which will require its own OpenSpec change and explicit authorization; these accidental invocations are a process breach that must remain visible instead of being absorbed into a no-model claim.
