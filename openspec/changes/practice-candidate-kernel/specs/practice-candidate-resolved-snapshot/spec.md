## ADDED Requirements

### Requirement: Resolved Candidate Snapshot

Each kernel-backed candidate MUST have a committed resolved snapshot that binds its immutable kernel identity and hash, declared overlay hashes, and materialized public task/starter hashes. Snapshot verification MUST fail when any bound source input or resolved public output changes.

#### Scenario: Kernel source changes after snapshot generation

- **WHEN** a kernel-backed candidate's declared kernel changes after its resolved snapshot is generated
- **THEN** snapshot verification fails until the candidate snapshot is regenerated and reviewed

### Requirement: Generated Output Is Excluded

Resolved snapshot verification MUST exclude installed dependencies, build output, browser test output, run workspaces, logs, and evidence indexes while retaining all source inputs needed to reproduce the resolved public input.

#### Scenario: Build output is present during snapshot verification

- **WHEN** a maintainer has installed dependencies or built a candidate locally
- **THEN** snapshot verification remains determined by committed kernel and candidate source rather than generated output
