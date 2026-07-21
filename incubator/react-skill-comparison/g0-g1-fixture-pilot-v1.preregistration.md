# G0/G1 fixture pilot v1 — preregistration material

**Status:** awaiting a committed fixture source revision. This document is not
an executable experiment plan and cannot generate requests or records.

## Frozen design

| Field | Value |
| --- | --- |
| Run kind | `pilot` |
| Tasks | `member-hub-loader-v1`, `account-summary-request-cache-v1`, `delivery-notification-ingest-v1` |
| Direct analysis set | `member-hub-loader-v1`, `account-summary-request-cache-v1` |
| Control guardrail | `delivery-notification-ingest-v1` (`out-of-domain`) |
| Conditions | G0 `baseline/v1`; G1 `vercel-skill/v2` |
| Repetitions | 2 per task and condition |
| Request count | `3 tasks × 2 conditions × 2 repeats = 12` |
| Treatment difference | The only intended difference between G0 and G1 |
| Conclusion status | Never eligible for an official comparison or published Skill-effect conclusion |

## Binding requirements

The future `experiments/react-skill-comparison/g0-g1-fixture-pilot-v1.yaml`
must be created only after the fixture/task changes are committed. It must use
that commit's full SHA-1 as `source_commit`, retain suite version `0.4.0`, and
copy the current task snapshot IDs through request generation.

It also must fix the same formal environment, Pi `0.80.10`, system prompt hash,
tool-policy hash, model ID and immutable provider model snapshot. Until the
provider snapshot is available, the plan may only be used for contract-only
dry-runs. No request, artifact manifest, or run record may use this document as
provenance.

## Acceptance before creation

- `bun run test:fixtures`, `bun run validate`, and `bun run test:contracts`
  pass on the committed revision.
- The active plan contains exactly these three task IDs and no retired task.
- The request generator produces exactly 12 stable IDs, each with
  `run_kind: pilot` and a repeat of `1` or `2`.
- G0 has no Skill access and G1 stages only the verified local
  `vercel-skill/v2` bundle.
