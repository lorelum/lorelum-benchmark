## Context

The #123 runtime-closure fix makes both current candidates calibratable in a clean materialized environment. The repository now adds immutable `incubator/practice-injection-plans/balanced-diagnostics-v2.yaml` with current snapshot identities for the same two candidates, three conditions, and three repeats. The mainline runner already consumes this plan-only contract, but currently executes its entire schedule; a one-candidate score check needs a constrained, derivable one-repeat selection.

This is an incubator admission gate for #91, not a formal benchmark run. Historical results remain immutable.

## Goals / Non-Goals

**Goals:**

- Verify the declared Pi/model endpoint with the existing 30-second preflight before task attempts.
- Re-run both candidates' complete reference/equivalent/anti-pattern calibration matrix through the versioned closure in isolation.
- Permit a one-repeat baseline/oracle-practice/irrelevant-practice diagnostic only from a validated plan and produce redacted evidence.
- Preserve planned denominators, evaluator health, semantic result, Practice observation, and strict joint-pass comparison.

**Non-Goals:**

- No new candidate, Practice card, public task, starter, evaluator assertion, suite revision, formal record, retrieval, or #92 aggregation.
- No model invocation before this OpenSpec-only PR has passed strict validation and the planning confirmation covers observable behavior, controls, private acceptance, immutable source, model, prompt, budget, and blind-review boundary.
- No causal, generalized, or reproducibility claim from the one-repeat gate.

## Decisions

### Plan-only execution

The runner SHALL consume the versioned plan and reject candidate-list or `--repeat` overrides. It validates candidate id, source commit, snapshot id, profile input hash, declared conditions, schedule seed, and repeat count before workspace creation. A dedicated one-repeat gate option selects exactly one registered candidate and its first pre-registered three-condition block; it neither mutates nor replaces the checked-in `balanced-diagnostics-v2` three-repeat plan.

Reading candidate-local repetitions is rejected because it can diverge from the registered plan. Running only oracle-practice is also rejected because the two controls are necessary to diagnose execution and injection failures.

### Gate order

The sequence is preflight -> isolated calibration -> one-repeat diagnostic -> review -> authorized three-repeat expansion. A failure stops later stages and emits only a redacted category. Calibration is evaluator-only and cannot imply a Practice effect.

### Evidence and privacy

Scratch may retain local diagnostic logs and diffs, but any reported summary contains only redacted condition and identity metadata, health, semantic, observation, and joint-pass states. Agent workspaces receive only `public/task.md` and `public/starter`; Practice payloads remain condition-scoped in memory.

### Admission conclusion

One repeat is diagnostic-only. A candidate advances only when calibration is healthy, every planned attempt is evaluated, and oracle joint-pass strictly exceeds both controls. All other outcomes remain diagnostic or uncertain.

## Risks / Trade-offs

- [Endpoint credentials or availability vary] -> classify failures without secrets and without creating a workspace.
- [Linux isolation differs from Windows] -> run the closure-calibration matrix in a clean isolated environment.
- [Plan identity drifts] -> fail closed before any Pi invocation.
- [Small samples overstate a signal] -> retain diagnostic-only language and require the later three-repeat screen.

## Migration Plan

1. Strictly validate this change and create its OpenSpec-only PR for #91.
2. Obtain planning confirmation and write it back to this design and `tasks.md`.
3. Add the plan-derived one-repeat gate and focused tests, then run validation and leakage audits.
4. Run authorized preflight, calibration, and one-repeat gate, retaining only redacted scratch evidence.
5. Review whether to authorize three-repeat screening or keep #91 paused.

Rollback leaves candidate inputs and historical artifacts untouched; ignored scratch output is disposable and no formal record is created.

## Planning Confirmation

The requirements owner authorized the balanced three-repeat #91 verification.
The committed `balanced-diagnostics-v2` plan is the immutable execution input:
its two declared candidates each run baseline, oracle-practice, and
irrelevant-practice three times. Observable behavior, the expected baseline
defect, the related and equal-length irrelevant controls, and private semantic
and quality acceptance remain those declared by each fixed candidate profile.

The run uses the candidate-declared model, prompt/tool policy, and ten-minute
budget, with no blind review. Every attempt must preserve the plan's source
commit, snapshot, and profile-input identity; a joint pass still requires a
healthy private semantic result and observed Practice behavior. The resulting
scratch summary is diagnostic evidence only: it creates no formal manifest,
record, suite revision, #92 aggregation, causal claim, or expansion decision.

## Execution Status

The first declared candidate completed its fixed three-repeat screen. At the
requirements owner's instruction, execution stopped before the second declared
candidate began. The incomplete second candidate remains a planned but empty
denominator, so the batch-level report remains diagnostic-only and no
cross-candidate conclusion is permitted.
