## ADDED Requirements

### Requirement: Public dependencies are provisioned before evaluation

After Pi completes an attempt and before private evaluator invocation, the profile diagnostic runner MUST provision dependencies in the clean public app workspace using the current Bun executable and `install --frozen-lockfile`. It MUST use only the workspace's public package manifest and lockfile and MUST NOT install, mount, or resolve any private dependency path into the agent workspace.

#### Scenario: Evaluator receives a lockfile-provisioned public workspace
- **WHEN** Pi completes an attempt whose public app workspace declares a lockfile
- **THEN** the runner provisions dependencies from that lockfile before invoking the private evaluator

### Requirement: Provisioning fails closed with a redacted category

The runner MUST record `evaluation_status=execution-failed` and a stable redacted provisioning reason when public dependency provisioning fails or times out. It MUST NOT invoke the private evaluator or infer semantic, Practice observation, or joint-pass fields from the failed attempt.

#### Scenario: Frozen install fails
- **WHEN** `install --frozen-lockfile` exits nonzero or exceeds its timeout
- **THEN** the runner records the provisioning failure and skips evaluator invocation

### Requirement: Provisioning occurs after the agent attempt

The runner MUST provision dependencies after the Pi process exits, so the agent initially receives only the declared public task and starter tree. It MUST preserve the workspace isolation audit and must not alter the declared model prompt, tool policy, budget, or condition payload.

#### Scenario: Pi receives no preinstalled workspace
- **WHEN** the runner begins a diagnostic attempt
- **THEN** it invokes Pi before public dependency provisioning and verifies the public/private workspace boundary before evaluation
