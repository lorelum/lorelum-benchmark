## Context

`injection-calibration/v1` candidates currently emit `{ semantic, practice_probe
}` as two strings. The profile diagnostic runner then marks an entry
`evaluation-failed` unless both are `pass`. That status is semantically wrong:
an evaluator that produced a valid semantic pass and an absent Practice signal
did evaluate successfully.

Issue #114 also identified a false negative in two candidate probes. Their
boundary evidence searched module text for the reference-oriented literal
`services/http`; an equivalent boundary in `src/services/` imports `./http` and
is not recognized. The candidates are unfrozen, but their snapshots and private
calibration matrices are immutable inputs to any future comparison once
updated.

This contract applies to every current and future Practice-injection candidate.
The implementation trial is deliberately limited to the profile diagnostic path
and the two unfrozen candidates, so it can establish regression evidence
without changing unrelated candidates. It must preserve public/private
isolation, avoid model calls and formal records, and follow the repository's
OpenSpec lifecycle gate.

## Goals / Non-Goals

**Goals:**

- Represent semantic outcome, Practice observation, and evaluator/execution
  health independently.
- Define `indeterminate` when a probe lacks enough reliable evidence to make a
  responsibility judgement.
- Make the independent result contract and calibration/reporting obligations
  mandatory for all current and future Practice-injection cards.
- Detect the declared HTTP adapter by resolved TypeScript import identity, not
  path spelling, in the two trial candidates.
- Prove the new classification with private reference, equivalent,
  anti-pattern, and public-starter calibration samples before any model work.

**Non-Goals:**

- Changing public task behavior, starter code, Practice text, conditions,
  models, prompts, budgets, or any frozen task/evaluator.
- Re-running Pi or a model, producing a formal record, promoting a candidate,
  or making an effectiveness claim.
- Generalizing this result contract to the unrelated formal evaluator v2 in
  this change.

## Decisions

### Independent outcome axes

Candidate evaluators will emit a structured result that separates:

- `semantic`: `pass`, `fail`, or `not-run`;
- `practice_observation`: `observed`, `not-observed`, `indeterminate`, or
  `not-run`, with a reason when indeterminate; and
- runner-owned `evaluation_status`: `evaluated`, `invalid-output`,
  `execution-failed`, or `not-executable`.

`evaluation_status` means whether the pipeline produced a usable result. It is
never derived from a semantic or Practice value. `joint_pass` remains a derived
analysis field only. This replaces the old binary practice result because a
boolean cannot distinguish an absent practice quality from a broken or
out-of-scope measurement.

Alternative considered: retain `practice_probe=pass/fail` and only change the
runner label. Rejected because the probe itself cannot express indeterminate,
and consumers would still interpret `fail` as a reliable negative observation.

### Evidence, not implementation layout

Each trial verifier will parse the component and direct boundary imports with
the candidate's TypeScript compiler, resolve relative module specifiers against
their importer, and compare canonical resolved paths to the declared starter
HTTP adapter identity. It will continue to assess the declared transport and
domain-result responsibility in the resolved boundary source.

An unresolvable relative import, unsupported import form, or ambiguous graph
will produce `indeterminate` with a machine-readable reason. A calibrated
anti-pattern provides the affirmative basis for `not-observed`. The resolver
must not treat filenames, directory layouts, raw import strings, local helper
names, or reference layout as evidence.

Alternative considered: broad regexes for multiple import spellings. Rejected
because it grows a list of layouts rather than identifying program identity and
cannot represent unsupported cases honestly.

### Reporting and runner exit behavior

The runner parser will validate the complete result contract. Parsed output
gets `evaluation_status=evaluated` regardless of semantic or Practice values;
missing or invalid structured output gets `invalid-output`. Batch command exit
behavior will report execution/invalid-output faults only, so an informative
`not-observed` does not turn a diagnostic run into an evaluator failure.

Summary consumers must present counts for semantic pass, observed,
not-observed, indeterminate, and derived joint pass separately. No weighted
score is introduced.

### Candidate trial and migration

The guide and capability specification make the contract mandatory for every
current and future Practice-injection candidate. Only the two named candidates
migrate their evaluator output in this implementation trial. Their calibration
drivers will declare expected observation states and their snapshots will be
regenerated after the private implementation changes. Other existing candidates
adopt the contract only through their own issue/OpenSpec change, preserving
their frozen input histories. The existing #90 scratch outputs remain historical
diagnostic evidence; when their workspaces are available, evaluator-only replay
can classify them under the new contract without a model call.

## Risks / Trade-offs

- [Resolver misses a valid module form] -> emit `indeterminate`, document the
  reason, and add coverage before treating that form as negative evidence.
- [A weak anti-pattern is classified as observed] -> retain and run the
  existing anti-pattern calibration plus a candidate-specific assertion for
  the declared responsibility.
- [Private paths leak through diagnostic output] -> keep reasons as stable
  category codes, retain private source details only in private evaluator logs,
  and add a redaction audit.
- [Historical summary consumers expect `practice_probe`] -> change the
  diagnostic schema version and update its focused parser tests; do not claim
  old and new values are directly interchangeable.
- [Change expands into experiment redesign] -> the planning gate prohibits
  changing Practice, task, conditions, or execution configuration; split any
  such discovery into a new issue/change.

## Migration Plan

1. Create and strict-validate this OpenSpec-only PR.
2. Complete the required planning confirmation in #114, this design, and
   `tasks.md`; do not implement before it is recorded.
3. Implement the result contract and runner mapping with focused tests.
4. Migrate and calibrate the two candidate probes, update their snapshots, and
   run evaluator-only replay when existing scratch workspaces are available.
5. Run leakage audit, focused tests, `bun run test:pi:v2`, `bun run validate`,
   and OpenSpec strict validation; record commands and omissions in the PR.

Rollback is a revert of the unfrozen candidate and diagnostic-runner changes.
No formal record or frozen revision is mutated by this change.

## Open Questions

- Planning confirmation is pending after the initial PR. The response must
  explicitly confirm the two candidates' observable behavior, Practice
  behavior, baseline discrimination, relevant/irrelevant controls, private
  semantic and quality checks, starter/snapshot identity, and model/prompt/
  budget/blind-review boundaries.
- The exact public-facing name of the new profile diagnostic summary schema
  will be selected during implementation; its version must prevent consumers
  from mistaking it for the old binary schema.
