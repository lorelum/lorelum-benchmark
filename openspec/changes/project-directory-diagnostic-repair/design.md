## Context

The second #91 candidate, `project-directory-resource-state-v1`, failed its one-repeat gate after passing its runtime-closure calibration. The runner copied its public starter to a clean workspace and invoked the private evaluator without first installing the public lockfile dependencies. The evaluator's public semantic test therefore failed in the unprovisioned workspace; running the same public test after `bun install --frozen-lockfile` passed. The private Practice probe already observed the expected signal, so neither the candidate nor scoring contract requires change.

The candidate has no formal record and remains in `incubator/`. The diagnostic scratch output is historical evidence and must not be overwritten or merged with later results.

## Goals / Non-Goals

**Goals:**

- Provision public dependencies in each clean workspace after Pi and before private evaluation.
- Apply the smallest verified runner repair without changing the public task behavior, Practice pair, model, prompt, budget, evaluator/probe, or decision rule.
- Validate reference, responsibility-equivalent, and anti-pattern calibration without changing the candidate snapshot; bind later re-admission output to the repaired runner source identity.
- Verify public/private separation, evaluator health, and a one-repeat redacted re-admission gate.

**Non-Goals:**

- No change to either candidate, private evaluator/probe, #91 historical scratch results, or formal benchmark records.
- No public disclosure of private evaluator/oracle/Practice text or calibration fixture content.
- No three-repeat #91 expansion, causal claim, or #92 aggregation in this change.

## Decisions

### Confirmed repair boundary

The requester confirmed that the public project-directory behavior, existing oracle and irrelevant Practice pair, condition channels, decision rule, Pi/model, prompt, 10-minute budget, and no-blind-review boundary remain fixed. The root cause is now classified as public workspace provisioning, so no scoring simplification, candidate change, evaluator change, snapshot update, or new candidate plan is needed. The runner repair updates OpenSpec/stable specification and focused tests.

### Public lockfile provisioning before evaluation

Before Pi starts, the runner captures regular public `package.json` and
`bun.lock` files plus their hashes into runner-controlled staging outside the
agent workspace. After Pi exits, it verifies the in-workspace files retain
those identities, invokes the current Bun executable from staging with
`install --frozen-lockfile --ignore-scripts`, and copies only the generated
dependencies into the public app workspace. The installer therefore never
reads Pi-authored dependency metadata or runs lifecycle scripts. A bounded
provisioning or identity failure SHALL record `execution-failed` with a stable
redacted reason and SHALL not invoke the evaluator.

### Public behavior and treatment remain fixed

The public task describes project loading, search, loading, empty, error, and retry-recovery states. The existing oracle and equal-length irrelevant Practice identities, condition channels, model, prompt, budget, and strict joint-pass decision rule are fixed inputs; changing any requires a separate confirmed scope.

### Fail closed and preserve evidence

Nonzero evaluator exits remain non-healthy even if structured output exists. Provisioning failures are separately redacted and do not run the evaluator. Prior scratch runs remain unchanged; post-repair output uses the new runner source identity and is not combined with it.

## Risks / Trade-offs

- [Public lockfile cannot reconstruct the workspace] -> fail closed before evaluation and retain only a redacted provisioning category.
- [Pi changes dependency metadata or adds lifecycle scripts] -> capture and
  verify immutable pre-Pi inputs, provision only from runner staging, and pass
  `--ignore-scripts`.
- [Repair changes runner behavior for every candidate] -> add focused ordering/failure tests and revalidate both candidates' calibration before re-admission.
- [Private diagnostics leak] -> restrict reports to stable categories, hashes, and redacted condition identity.

## Migration Plan

1. Strictly validate this change and create the OpenSpec-only PR linked to #126.
2. Confirm the fixed public behavior, treatment pair, private acceptance role, immutable source/snapshot policy, and re-admission model boundary with the requester.
3. Add public lockfile provisioning and focused ordering/failure tests.
4. Run full private calibration, closure verification, public/private audit, `bun run validate`, and strict OpenSpec validation.
5. Run one authorized redacted gate and report diagnostic-only admission status under the repaired runner source identity.

## Open Questions

None.
