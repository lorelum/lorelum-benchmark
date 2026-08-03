## ADDED Requirements

### Requirement: Pi and model preflight is isolated and bounded
The profile diagnostic runner MUST verify the configured Pi command and model
with a bounded probe before it creates a candidate workspace or invokes an
attempt. The probe MUST use non-interactive, non-persistent Pi execution with
tools, project context files, Skills, and extensions disabled. It MUST NOT
receive task, candidate, Practice, private, evaluator, oracle, snapshot, or
workspace inputs, and it MUST NOT modify the repository or candidate paths.

The probe timeout MUST be finite and sufficient for the configured runtime's
normal isolated startup. On command, provider, or deadline failure, the runner
MUST fail closed with a redacted non-executable status; it MUST NOT report a
candidate, semantic, Practice, Oracle, or comparative failure.

#### Scenario: Healthy isolated preflight proceeds
- **WHEN** the configured Pi command returns a successful response within the
  bounded isolated-probe deadline
- **THEN** the runner records the runtime version and may continue to create
  fresh public-only candidate workspaces for the validated schedule

#### Scenario: Preflight cannot alter project state
- **WHEN** the model preflight is run from a repository containing OpenSpec,
  candidate, or private files
- **THEN** Pi receives no tools or project context and the probe leaves those
  files unchanged without exposing their contents

#### Scenario: Slow or unavailable preflight fails closed
- **WHEN** the configured Pi command or provider does not return before the
  finite probe deadline, or exits unsuccessfully
- **THEN** the runner emits only a redacted non-executable diagnostic status
  and creates no candidate workspace, formal manifest, or record
