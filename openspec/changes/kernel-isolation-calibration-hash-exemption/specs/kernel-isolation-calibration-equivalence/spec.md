## ADDED Requirements

### Requirement: Calibration duplicates require independent public equivalence
The `core/v1` isolation audit MUST treat a private calibration file as exempt
from content-hash leakage detection only when the file is below
`private/calibration/` and its SHA-256 matches a regular file in an explicitly
provided public-source root. The audit MUST NOT use the materialized workspace
as evidence of public equivalence.

#### Scenario: Calibration fixture repeats public starter content
- **WHEN** a regular file below `private/calibration/` is byte-identical to a
  file in a supplied public-source root and the workspace contains that content
- **THEN** the audit does not report that workspace file solely for the matching
  calibration hash

#### Scenario: Private-only calibration content appears in the workspace
- **WHEN** a file below `private/calibration/` has no byte-identical regular file
  in the supplied public-source roots and its content appears in the workspace
- **THEN** the audit reports the workspace file as leaked

### Requirement: Isolation remains fail-closed for private boundary indicators
The isolation audit MUST continue to report workspace files with a `private`
path segment or a basename found in supplied private material outside
`private/calibration/`, regardless of calibration equivalence. Every private
file outside `private/calibration/` MUST continue to participate in content-hash
leakage detection.

#### Scenario: Private oracle is copied to the workspace
- **WHEN** an oracle, evaluator, conditions file, or Practice card from a
  private path is copied into the workspace
- **THEN** the audit reports the copied workspace file as leaked

#### Scenario: No public-source roots are supplied
- **WHEN** an isolation caller omits public-source roots
- **THEN** the audit applies content-hash leakage detection to every private
  file, including files below `private/calibration/`
