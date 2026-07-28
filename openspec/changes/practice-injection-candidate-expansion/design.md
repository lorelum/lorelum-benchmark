## Context

#98 merged `core/v1`, the `react-vite` materializer, resolved snapshots, and
static `injection-calibration/v1` TypeScript types. The core deliberately does
not parse profile fields. #75 independently demonstrates a private
`conditions.yaml` with three controls, Practice hashes, an unavailable
retrieval condition, and a private runtime channel, but that historical
candidate cannot be retrofitted or used as mutable shared infrastructure.

#100 supplies the profile-owned runtime contract that future Practice
candidates can use. #89 / PR #97 remains the separate evidence chain for
concrete candidate fixtures.

## Goals / Non-Goals

**Goals:**

- Define a versioned private document and runtime adapter for
  `injection-calibration/v1` conditions.
- Validate declared control shape, Practice hashes, channel selection,
  equal-length-control metadata, and decision-rule declaration without
  interpreting the candidate's semantic or quality oracle.
- Guarantee that Practice text is condition-scoped private runtime input, not
  an agent workspace file, public task prompt, resolved workspace artifact, or
  public trace payload.
- Extend resolved snapshot data with a profile-owned input hash and verify it
  with a neutral fixture.

**Non-Goals:**

- Migrate #75 or create/migrate #89 candidate fixtures.
- Change `core/v1`, introduce a model call, execute retrieval, create a record,
  or upgrade a candidate to a suite revision.
- Define universal Practice content, a global oracle, or an automatic benchmark
  advancement decision.

## Decisions

### Profile runtime owns condition parsing

The profile runtime, not core, reads a candidate-private `conditions.yaml`.
The document declares `baseline`, `oracle-practice`, and
`irrelevant-practice`; `lorelum-retrieval` is explicitly unavailable until a
versioned retrieval runtime exists. This preserves the core's track-agnostic
boundary while giving future Practice candidates one operational contract.

Rejected alternative: add conditions parsing to core. That would make core
interpret Practice semantics and force unrelated Skill tasks to inherit a
Practice-specific contract.

### Injection is a runtime payload, not workspace materialization

The runtime adapter resolves the selected private Practice file, verifies its
declared SHA-256, and returns a condition-scoped payload to the execution
boundary. The materializer continues to copy only public task and starter
files. Traces record the Practice id/version/hash and channel name, never the
card text or private path.

Rejected alternative: copy the selected card into the workspace or append it
to `task.md`. Either makes private treatment material visible to the agent and
invalidates public/private isolation.

### Profile input hash is separate from public materialized output

The profile runtime computes a canonical hash over conditions metadata,
Practice identifiers and declared hashes, equal-length-control metadata, and
the decision rule. Resolved snapshots record this profile-input hash alongside
the core input and materialized public output hashes. The Practice card text
is not included in a public snapshot field; its declared content hash detects
card changes.

Rejected alternative: include private Practice text in the resolved workspace
hash. This would enlarge the agent-facing materialized contract and risks
leakage through logs or copied workspace files.

### Neutral fixture verifies mechanics, not domain conclusions

A neutral fixture uses placeholder private cards and command stubs. It proves
condition routing, hash verification, leakage prevention, control measurement
declaration, and decision-rule input preservation without deciding whether a
real Practice is semantically relevant or effective.

## Risks / Trade-offs

- [A profile parser could leak a private card] -> return payloads only to a
  private execution API and test workspace/public-trace absence.
- [Length comparison can create false equivalence] -> require a declared
  metric, values, threshold, and independent-review marker; the exact metric
  remains a planning-gate decision for the first consumer.
- [A declarative decision rule could be misread as an experiment result] ->
  preserve the rule as input metadata and prohibit this change from executing
  a model or creating records.
- [#89 and #100 overlap] -> #100 exposes only reusable profile runtime;
  #89 owns concrete candidate source, oracle, calibration fixtures, and any
  future migration.

## Migration Plan

1. Create this OpenSpec-only PR from merged #98.
2. Complete the planning clarification below and write the answers back to
   Issue #100 and this design/tasks.
3. Implement profile runtime, neutral fixture, resolved-snapshot hook, and
   generated-output hygiene in this same PR.
4. Run focused tests, `bun run validate`, leak audit, and strict OpenSpec
   validation; do not run Pi, a model, retrieval, or records.
5. Let #89 consume the merged profile contract in its own PR only after its
   independent candidate planning gate passes.

## Open Questions

- Which equal-length metric and tolerance are authoritative for the first
  consumer: rendered characters, tokenizer count, or another declared metric?
- What exact private execution API receives the payload, and which trace fields
  are sufficient for audit without exposing card text or private paths?
- Is `decision_rule` limited to strict comparison of jointly passing attempts,
  and which conditions are required before it can be reported?
- Which starter commit and immutable public source will the first #89 consumer
  pin after this profile contract merges?
