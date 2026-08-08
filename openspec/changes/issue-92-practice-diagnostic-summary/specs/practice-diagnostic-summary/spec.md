## ADDED Requirements

### Requirement: Corpus summary is computed per fixed input identity

The #92 driver MUST consume a list of `profile-diagnostic-summary/v3` documents, map each
through the practice adapter, and interpret every unit with the practice decision rule
(active=oracle-practice, controls=[baseline, irrelevant-practice],
strictly-greater-than-each-control). Units MUST be isolated by
candidate × profile_input_hash; different source_commit, snapshot_id, or profile_input_hash
MUST NOT share a denominator.

#### Scenario: Two summaries with different input hashes stay separate
- **WHEN** the corpus contains summaries for different profile_input_hash values
- **THEN** each unit is judged separately and no cross-unit denominator is formed

#### Scenario: A missing summary is listed as a gap
- **WHEN** a planned corpus entry has no readable v3 summary
- **THEN** the driver records the missing entry as an execution gap and keeps the aggregate
  outcome uncertain

### Requirement: Output is audited and redacted

The driver MUST produce a machine-readable summary and a human-readable report in which every
conclusion maps to source_commit, snapshot_id, and profile_input_hash, preserves raw
per-condition counts, and never emits a weighted total score or an aggregate signal. It MUST
NOT include practice text, private paths, or workspace paths. The #75 historical candidate
MUST appear only in a separate non-comparable historical section.

#### Scenario: Every conclusion carries its evidence chain
- **WHEN** the report lists a unit verdict
- **THEN** it includes the unit evidence and per-condition joint-pass/raw counts

#### Scenario: No weighted score or aggregate signal
- **WHEN** multiple units are summarized
- **THEN** the aggregate section reports only verdict distribution and execution gaps

#### Scenario: Historical #75 is separated
- **WHEN** the corpus includes #75 historical results
- **THEN** they appear only as non-comparable historical background, never in the verdict
  distribution or denominators

### Requirement: Execution gaps and incomplete corpora yield uncertain

A unit MUST be `uncertain` when any planned attempt is missing, non-evaluated, or has
indeterminate quality. The aggregate outcome MUST be `uncertain` when any unit is `uncertain`
or any corpus entry is missing; otherwise it MUST be `diagnostic-only`.

#### Scenario: Unhealthy attempt blocks a signal
- **WHEN** a unit has an execution-failed attempt despite oracle joint-pass leading
- **THEN** the unit verdict is `uncertain` with an unhealthy-attempt reason

#### Scenario: Aggregate reflects gaps
- **WHEN** at least one unit is uncertain or a corpus entry is missing
- **THEN** the aggregate outcome is `uncertain` and the gaps are listed