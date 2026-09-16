## ADDED Requirements

### Requirement: Local Pi model requests use the configured API address

The local profile diagnostic runner MUST use `LORELUM_PI_BASE_URL` as the DeepSeek model API address when it is set. When `LORELUM_PI_BASE_URL` is unset, it MUST fall back to `LORELUM_JUDGE_BASE_URL`. When neither variable is set, the runner MUST preserve the existing global Pi catalog behavior.

#### Scenario: Explicit local base URL

- **WHEN** `LORELUM_PI_BASE_URL` is set
- **THEN** the local diagnostic Pi catalog uses that address for DeepSeek models

#### Scenario: Judge endpoint fallback

- **WHEN** only `LORELUM_JUDGE_BASE_URL` is set
- **THEN** the local diagnostic Pi catalog uses the judge endpoint address for DeepSeek models

#### Scenario: No configured override

- **WHEN** neither local routing variable is set
- **THEN** the runner keeps the existing global Pi model catalog unchanged

### Requirement: Local model catalog override is isolated

The local runner MUST create its model catalog override in an isolated temporary `PI_CODING_AGENT_DIR`, MUST NOT write to the user's global Pi config, and MUST clean up the temporary directory when the local diagnostic finishes.

#### Scenario: Temporary catalog cleanup

- **WHEN** a local diagnostic run completes or fails
- **THEN** the temporary model catalog directory is removed and the user's global Pi catalog remains unchanged

### Requirement: Formal Pi routing is unchanged

The formal `pi/v2` runner and its formal environment MUST NOT use the local `.env` routing override. Formal model requests MUST continue to use the environment manifest's fixed endpoint and proxy rules.

#### Scenario: Formal runner isolation

- **WHEN** the formal runner executes
- **THEN** it does not receive the local temporary `PI_CODING_AGENT_DIR` override
