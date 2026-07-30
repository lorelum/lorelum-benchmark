## Context

Issue #90 produced local, ignored diagnostic workspaces for two
`injection-calibration/v1` candidates under three conditions. Their v1 summary
predates #114's independent `semantic`, `practice_observation`, and
`evaluation_status` contract. Issue #117 must replay only the surviving
workspaces with the current private evaluators, produce a redacted v2 summary,
and decide whether #91 has bounded directional evidence to expand.

The replay is diagnostic evidence, not a new execution: it must not call Pi or
a model, alter any existing workspace, create a formal manifest or record, or
copy private evaluator inputs into an agent-visible location. Its report is
kept under ignored `scratch/` beside, never instead of, the v1 summary.

## Goals / Non-Goals

**Goals:**

- Re-evaluate every available planned #90 workspace independently with the
  current v2 evaluator and preserve complete planned denominators.
- Report semantic outcome, Practice observation, evaluator status, derived
  joint pass, and stable replay/audit reason on separate axes.
- Retain only source commit, snapshot identity, profile input hash, condition,
  repetition, and redacted Practice identity in the public-facing summary.
- Produce a reproducible, bounded decision for #91 without mixing historical
  inputs with a future execution plan.

**Non-Goals:**

- Changing candidate source, public task material, starter, Practice text,
  condition definitions, snapshots, model, prompts, budget, or evaluator
  semantics.
- Executing Pi, a model, retrieval, blind review, a formal manifest, a formal
  record, or a suite revision.
- Treating a replay as causal evidence of a Practice effect or aggregating it
  with #91 samples.

## Decisions

### Read-only, evaluator-only replay

The replay entry point SHALL receive explicit historical workspace locations
and invoke the candidate's current evaluator against each workspace. It SHALL
not instantiate a clean workspace, start Pi, or write into a historical path.
The output location is a new ignored scratch directory, so v1 artifacts remain
unchanged and diagnostic provenance is visible.

An alternative that re-runs the full diagnostic driver is rejected because it
would call a model and regenerate inputs, violating the issue's evidence
boundary.

### Planned denominator and availability are separate

The report SHALL enumerate the full candidate x historical profile input hash
x condition x repetition plan before attempting evaluation. A missing or
unreadable workspace becomes a `not-executable` replay entry with a stable
reason, rather than being removed from the denominator. Valid evaluator output
is mapped under the v2 contract; evaluator failures and malformed output remain
distinct from semantic or Practice states.

An alternative that reports only discovered directories is rejected because it
would hide missing evidence and could create a false condition comparison.

### Redacted summary with stable audit categories

The v2 summary SHALL use `profile-diagnostic-summary/v2`, retain the original
source and snapshot identities, and record only the redacted Practice
ID/version/hash supplied by the profile runtime. Reasons shall be category
codes, not private paths, evaluator source, Practice text, or workspace paths.

An alternative that attaches evaluator logs to the summary is rejected because
those logs can expose private implementation material and are unnecessary for
the stated comparison.

### Conservative #91 entry decision

Each candidate has an independent decision. A candidate is
`eligible-for-expansion` only when every one of its planned replays is
`evaluated`, calibration and leakage audits pass, and, within the same
historical input identity, the relevant Practice condition's raw joint-pass
count is strictly greater than both baseline and irrelevant Practice. #91 may
include only these eligible candidates. Healthy candidates without this strict
lead, or with indeterminate/insufficient Practice evidence, are
`adjust-before-expansion` and are excluded from #91. Missing workspaces, replay
faults, invalid output, or failed calibration/audits yield `indeterminate` and
also exclude that candidate from #91.

If no existing candidate is eligible, #91 is paused rather than repurposed as
an unqualified search. A separate issue must first adjust the candidate,
Practice, or probe and establish a new input identity before another expansion
decision. The batch-level conclusion is therefore a qualified candidate list,
not an aggregate pass/fail result.

This deliberately does not score or average candidate results, and it does not
make a causal claim. A looser aggregate rule is rejected because the issue
requires each candidate and input identity to remain independently auditable.

## Risks / Trade-offs

- [Historical workspaces no longer exist] -> preserve their planned entries,
  emit `indeterminate`, and do not supplement them with new model runs.
- [Current evaluator behavior differs from the original evaluator] -> label
  the output v2 and preserve source/snapshot identities alongside v1 results.
- [Private paths or Practice content leak into scratch output] -> generate
  traces only through redaction APIs and run a public/private leakage audit.
- [A negative probe result is misread as evaluator failure] -> preserve the
  v2 axes and make `evaluation_status` runner-owned.

## Migration Plan

1. Strict-validate this OpenSpec change and create an OpenSpec-only PR for
   #117.
2. Record the requirements-owner planning confirmation in the issue, this
   design, and `tasks.md`.
3. Add the read-only replay and v2 summary implementation with focused tests.
4. Run calibration, replay available workspaces, leakage audit, focused tests,
   `bun run validate`, and strict validation; report unavailable inputs.
5. Publish only the redacted diagnostic conclusion to #117; retain all output
   in ignored scratch and do not create a formal record.

Rollback is a revert of the replay implementation and OpenSpec change. The
historical workspaces, v1 summaries, candidates, and formal benchmark history
are never mutated.

## Open Questions

- Before implementation, the requirements owner must confirm the observable
  behavior and relevant/irrelevant controls remain those fixed by #114; that
  historical v2 replay is the only acceptable evidence input; the stated
  private semantic/quality acceptance and redaction boundary; the immutable
  starter/source identities; and the unchanged model, prompt, budget, and
  no-blind-review boundaries. These confirmations are recorded as the planning
  gate rather than inferred from this issue.
