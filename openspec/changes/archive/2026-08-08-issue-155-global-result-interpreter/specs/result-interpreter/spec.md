## ADDED Requirements

### Requirement: Result interpretation is channel-neutral

The interpreter MUST accept normalized attempt entries that carry only channel-neutral
fields: sample-unit identity (candidate, source_commit, snapshot_id, input_hash),
condition id, repeat, outcome expressed with the `outcome/v1` vocabulary, a redacted
injection trace. The interpreter MUST NOT require or emit
practice- or skill-specific fields, and MUST apply a decision rule supplied as data
by the caller rather than hardcoded condition names.

#### Scenario: Practice-like and skill-like fixtures use the same core
- **WHEN** a practice-like unit (baseline, oracle-practice, irrelevant-practice) and a
  skill-like unit (baseline, skill) are interpreted with the same declared rules
- **THEN** both flow through the identical interpreter core without channel-specific
  code, and each yields its own verdict

#### Scenario: Channel-specific content is rejected fail-closed
- **WHEN** an attempt entry carries a private or free-text field such as a practice
  text, private path, or workspace path
- **THEN** the interpreter rejects the entry, marks the unit `uncertain` with the
  reason, and does not emit the content into any summary

### Requirement: Sample units are isolated by fixed input identity

The interpreter MUST group entries by sample unit and MUST NOT aggregate, average, or
combine counts across units that differ in source_commit, snapshot_id, or input_hash.
Within a unit, every entry MUST carry the same source_commit, snapshot_id, and
input_hash; any mismatch fails the identity gate.

#### Scenario: Different input identities never share a denominator
- **WHEN** two units have different input_hash values
- **THEN** each unit is interpreted separately and no cross-unit denominator is formed

#### Scenario: Identity drift inside a unit fails the gate
- **WHEN** entries of one unit disagree on source_commit, snapshot_id, or input_hash
- **THEN** the unit is reported `uncertain` with an identity-drift reason

### Requirement: Planned denominators and decision rule are enforced per unit

The interpreter MUST validate that every planned condition × repeat attempt is present
before applying the decision rule. It MUST compute per-condition joint-pass counts and
declare `signal` only when the active condition's joint-pass count is strictly greater
than each control; otherwise it MUST declare `diagnostic-only`. Execution gaps,
non-evaluated attempts, or indeterminate quality MUST yield `uncertain`.

#### Scenario: Strict lead yields a signal
- **WHEN** every planned attempt is evaluated and the active condition's joint-pass
  count is strictly greater than each control
- **THEN** the unit verdict is `signal` with the evidence chain

#### Scenario: Missing or unhealthy attempts yield uncertain
- **WHEN** a planned attempt is absent, not evaluated, or has indeterminate quality
- **THEN** the unit verdict is `uncertain` with the specific reason, and no signal or
  diagnostic conclusion is inferred

#### Scenario: No strict lead stays diagnostic-only
- **WHEN** all planned attempts are evaluated but the active condition's joint-pass
  count is equal to or below any control
- **THEN** the unit verdict is `diagnostic-only`

### Requirement: Summary output is audited and redacted

The interpreter MUST produce a summary that maps every verdict to its sample-unit
evidence (source_commit, snapshot_id, input_hash), preserves planned denominators and
raw per-condition counts, and reports cross-unit verdict distribution and execution
gaps without computing a weighted total score. The summary MUST NOT contain private
material such as practice or skill text, private paths, or workspace paths.

#### Scenario: Per-unit evidence and raw counts are preserved
- **WHEN** the interpreter writes a summary
- **THEN** each unit carries its evidence, planned/evaluated counts, per-condition
  health, semantic, quality, and joint-pass counts, and its verdict with reasons

#### Scenario: Cross-unit output is diagnostic-only
- **WHEN** multiple units are summarized together
- **THEN** the cross-unit section reports only verdict distribution and execution gaps,
  never an aggregate `signal` or a weighted single score
