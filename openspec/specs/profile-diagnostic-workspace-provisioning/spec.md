# profile-diagnostic-workspace-provisioning Specification

## Purpose
TBD - created by archiving change project-directory-diagnostic-repair. Update Purpose after archive.
## Requirements
### Requirement: Public dependencies are provisioned before evaluation

Before Pi starts, the profile diagnostic runner MUST capture the clean public app
workspace's regular `package.json` and `bun.lock`, including their content
identities, into runner-controlled staging outside the agent workspace. After
Pi completes and before private evaluator invocation, it MUST verify the
workspace copies still have those identities, provision only from the staged
inputs using the current Bun executable with `install --frozen-lockfile
--ignore-scripts`, and copy only the generated dependencies into the public
app workspace. It MUST NOT install, mount, or resolve any private dependency
path into the agent workspace.

#### Scenario: Evaluator receives a lockfile-provisioned public workspace
- **WHEN** Pi completes an attempt whose public app workspace declares a lockfile
- **THEN** the runner provisions dependencies from the pre-Pi staged public
  lockfile before invoking the private evaluator

#### Scenario: Pi changes a dependency input
- **WHEN** Pi modifies, replaces, or removes the public `package.json` or
  `bun.lock` after their pre-Pi identities were captured
- **THEN** the runner fails closed without invoking the installer or evaluator

### Requirement: Provisioning fails closed with a redacted category

The runner MUST record `evaluation_status=execution-failed` and a stable redacted provisioning reason when public dependency provisioning fails or times out. It MUST NOT invoke the private evaluator or infer semantic, Practice observation, or joint-pass fields from the failed attempt.

#### Scenario: Frozen install fails
- **WHEN** `install --frozen-lockfile --ignore-scripts` exits nonzero or exceeds its timeout
- **THEN** the runner records the provisioning failure and skips evaluator invocation

### Requirement: Provisioning occurs after the agent attempt

The runner MUST provision dependencies after the Pi process exits, so the agent initially receives only the declared public task and starter tree. It MUST preserve the workspace isolation audit and must not alter the declared model prompt, tool policy, budget, or condition payload.

#### Scenario: Pi receives no preinstalled workspace
- **WHEN** the runner begins a diagnostic attempt
- **THEN** it invokes Pi before public dependency provisioning and verifies the public/private workspace boundary before evaluation

