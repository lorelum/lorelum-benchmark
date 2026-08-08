# practice-injection-v2-diagnostic-execution Specification

## Purpose

Define the v2 candidate three-condition diagnostic execution under #91: both v2
candidates run baseline/oracle-practice/irrelevant-practice three times with the
candidate-declared model and budget, plus a one-repeat re-admission rerun that replaces
only the failed parent slot (never adding a denominator or merging counts across plans),
producing redacted scratch evidence for directional diagnosis only.
## Requirements
### Requirement: v2 three-condition diagnostic keeps the declared conditions

The #91 v2 diagnostic MUST run the same three declared conditions (baseline, oracle-practice, irrelevant-practice) for each v2 candidate with at least three repeats per condition, the same agent/model/tool/budget declaration from the candidate, and `lorelum-retrieval` unavailable. A v2 run MUST NOT alter the condition set, the public task, or the Practice injection channel; it only executes the #151-delivered v2 candidates.

#### Scenario: v2 candidates run the full three-condition matrix
- **WHEN** the v2 diagnostic executes `profile-update-command-boundary-v2` and `project-directory-resource-state-v2`
- **THEN** each runs baseline/oracle-practice/irrelevant-practice with three repeats, identity-bound to the candidate snapshot and profile input hash

#### Scenario: v2 is diagnostic-only scratch
- **WHEN** the v2 run finishes
- **THEN** only redacted scratch evidence is produced; no formal record, suite revision, or cross-candidate conclusion is created

### Requirement: Per-attempt budget and probe revisions are documented and recalibrated

A v2 candidate MAY revise its per-attempt budget (10 to 25 minutes for the slower model) and its private probe (structured domain-translation check accepting taken/409/type-kind-outcome discriminators) before execution, provided the probe calibration matrix is re-run and still passes (reference/equivalent observed, anti-pattern not-observed, public-starter not-observed) and the candidate snapshot is regenerated. The revision MUST be recorded in the candidate's `private/calibration.md`.

#### Scenario: Budget and probe revision with recalibration
- **WHEN** the v2 candidate raises the budget and broadens the probe vocabulary
- **THEN** the probe matrix re-runs 4/4, the snapshot is regenerated, and `private/calibration.md` records the change

### Requirement: Re-admission rerun slots do not add denominator

When a v2 attempt fails (for example a Pi timeout) and a one-repeat re-admission plan reruns the same candidate block, the rerun slot MUST replace the failed slot for the affected condition and MUST NOT be added as a new denominator or merged across plans. The report MUST disclose the rerun and the #92 aggregation MUST count each condition once per planned slot.

#### Scenario: Failed oracle slot is filled by a rerun
- **WHEN** project-directory oracle block-3 fails and a one-repeat rerun supplies an oracle result
- **THEN** the condition denominator stays at the planned count and the rerun is disclosed as a replacement, not an extra sample

#### Scenario: #92 merges without cross-plan counting
- **WHEN** #92 aggregates the v2 diagnostic
- **THEN** it treats the rerun as a slot replacement, does not combine different plan ids or repetition counts into one denominator, and does not emit an aggregate conclusion

### Requirement: Result framing is directional-only

The v2 diagnostic MUST report oracle joint-pass vs each control per candidate; a directional signal requires oracle joint-pass strictly greater than both baseline and irrelevant-practice. The conclusion MUST stay diagnostic or directional, MUST NOT claim precise-injection effectiveness, and MUST note that real retrieval (condition C) is not implemented and that sample expansion awaits the real lorelum practice.

#### Scenario: Directional signal
- **WHEN** oracle joint-pass strictly exceeds both controls for a v2 candidate
- **THEN** the report marks a directional signal with sample-size and retrieval caveats

#### Scenario: No strict lead
- **WHEN** oracle does not strictly exceed both controls or any planned attempt is unhealthy
- **THEN** the report stays diagnostic/uncertain and does not upgrade conclusions

