## MODIFIED Requirements

### Requirement: Preserve Existing Candidate Inputs

The existing login-page-layered-api-v1 candidate MUST remain an independent historical candidate input.
A shared kernel implementation MAY support new candidates, but MUST NOT require migration of the login
candidate or alter its source snapshot, local execution materials, evaluator behavior or recorded inputs.
Practice track-specific candidate expansion and the login candidate's potential future migration are
handled by the separate practice-injection-candidate-expansion change, not by this repo-level kernel
change.

#### Scenario: Add a shared kernel after the login candidate exists

- **WHEN** a maintainer adds a kernel-backed candidate
- **THEN** the existing login candidate remains runnable and its existing snapshot verification semantics
remain unchanged
- **AND THEN** the login candidate is not required to declare a kernel block