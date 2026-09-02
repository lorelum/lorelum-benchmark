## ADDED Requirements

### Requirement: One-block model pilot runs only after full preflight

The pilot driver MUST NOT invoke any candidate or judge model call until every preflight gate passes and is recorded: candidate snapshot and profile identity match the merged v4 candidate manifests, offline calibration is qualified, the local `pi` version matches the declared agent version, credentials and endpoint configuration are available from environment variables without echoing or committing secrets, timeout/cancellation/cleanup is demonstrated on a real child process tree, the Stage 1 leakage audit reports zero hits for the Stage 2 prompt and private markers, and a dry-run of the three-condition one-block plan reports three dry-run attempts with zero model calls.

#### Scenario: Preflight failure blocks model calls

- **WHEN** any preflight gate fails
- **THEN** the pilot exits non-zero without invoking any model call and records the failing gate

#### Scenario: Dry-run covers one block with zero model calls

- **WHEN** the pilot runs in dry-run mode
- **THEN** the schedule contains whole blocks of three attempts covering baseline, oracle-practice, and irrelevant-practice exactly once per block, and no Pi subprocess is started

### Requirement: Whole diagnostic blocks, three conditions, deterministic schedule

Each authorized pilot run MUST execute whole blocks of three attempts derived from the existing `staged-profile-diagnostic-plan/v1` contract with `cyclic-latin-square/v1` and the declared `schedule_seed`, covering each of the three conditions exactly once per block. The initial authorization covers one block; additional diagnostic blocks require an explicit scope extension recorded on the authorizing issue. The pilot MUST NOT rerun failed or unhealthy attempts and MUST keep every planned attempt in the denominator.

#### Scenario: Unhealthy attempt stays in the denominator

- **WHEN** an attempt is execution unhealthy or indeterminate
- **THEN** it remains in the planned denominator with its recorded reason and no replacement attempt is scheduled

### Requirement: Stage budgets are enforced with process-tree termination

Each attempt MUST allow at most the profile-declared model execution budget per stage (15 minutes Stage 1, 15 minutes Stage 2), measured on the Pi subprocess and excluding offline evaluator time. On expiry the driver MUST terminate the Pi process tree, clean up child processes, and record the attempt as execution unhealthy with a timeout reason.

#### Scenario: Stage timeout terminates the run

- **WHEN** a Pi stage subprocess exceeds its declared budget
- **THEN** its process tree is terminated, cleanup completes, and the attempt is execution unhealthy rather than evaluated

### Requirement: Stage 2 resumes the same Pi session fail-closed

Stage 2 MUST continue the exact Stage 1 Pi session in the same app workspace. Session resume failure, session id mismatch, or transcript materialization inside the agent workspace MUST be recorded as execution unhealthy or the staged runner's fail-closed binding, and MUST NOT be downgraded to a no-session execution.

#### Scenario: Transcripts stay outside agent reach

- **WHEN** the driver provisions an attempt
- **THEN** the workspace and the transcript/session/log artifact roots are separate sibling directories, so the agent's own working directory does not directly expose session material

#### Scenario: Resume mismatch fails closed

- **WHEN** the resumed session id differs from the Stage 1 session id or resume throws
- **THEN** the attempt records `resume-failed` session binding and execution unhealthy

### Requirement: No judge, no weighted score, no semantic retry

The pilot MUST NOT invoke any judge model, MUST NOT compute or report a weighted structure score, and MUST NOT retry an attempt for semantic reasons. Reported structure results are limited to per-check `pass`, `fail`, or `indeterminate` labels plus raw concentration metrics from the frozen deterministic evaluator.

#### Scenario: Structure results stay raw

- **WHEN** the pilot summarizes an evaluated attempt
- **THEN** it reports each deterministic check label and raw concentration metrics only, with ambiguous evidence preserved as `indeterminate`

### Requirement: Artifacts and public summary are redacted

Transcripts, run workspaces, session directories, snapshots, and stage copies MUST live outside the repository or in explicitly git-ignored artifact areas and MUST NOT be committed. Attempt artifacts MUST NOT be placed inside or directly adjacent to the agent workspace directory. The public summary MUST contain only run and attempt ids, condition, session binding state, necessary hashes, execution health, stage semantic labels, deterministic structure check labels, and raw metrics, and MUST state that the one-block smoke does not constitute a directional-screen, Practice effect, or formal benchmark conclusion.

#### Scenario: Summary stays redacted

- **WHEN** the pilot emits its public summary
- **THEN** it contains no transcript content, Practice full text, credential, endpoint, private evaluator, oracle, or scoring material
