## ADDED Requirements

### Requirement: Directional screen runs only after preflight on a frozen candidate

The screen driver MUST reuse the merged staged pilot driver unchanged in execution semantics (identity checks, six preflight gates, cyclic-latin-square scheduling with the existing schedule seed, fail-closed session resume, per-stage budgets with process-tree termination) and MUST NOT modify the candidate task prompts, oracle, practices, conditions, snapshot, or the frozen `two-stage-structure/v1` analyzer. The screen MUST declare five blocks (fifteen attempts, five per condition) on the `deepseek/deepseek-v4-flash` model tier before any model call.

#### Scenario: Frozen candidate is untouched

- **WHEN** the screen completes
- **THEN** no candidate-private or public file under `incubator/practice-injection/llm-provider-gateway-v4/` differs from the merged main state, and any diff that does appear stays inside screen-only additions

#### Scenario: Preflight failure blocks model calls

- **WHEN** any preflight gate fails or the dry-run plan is not fifteen attempts covering each condition five times
- **THEN** the screen exits non-zero with zero model calls

### Requirement: Denominator completeness and no reruns

All fifteen planned attempts MUST stay in the planned denominator. Execution-unhealthy attempts, stage semantic failures, and indeterminate structure checks MUST be recorded with reasons and MUST NOT be retried, replaced, or removed. No additional blocks may be appended after the screen starts.

#### Scenario: Unhealthy attempts remain

- **WHEN** attempts time out, fail to resume the session, or fail semantics
- **THEN** they remain in the denominator with their failure reason and no replacement attempt is scheduled

### Requirement: Interpretation follows the pre-registered four-valued rule

The summary MUST classify the screen as exactly one of `directional`, `no-discriminability`, `saturated`, or `insufficient-observations`, derived only from per-attempt structure results under the pre-registered rules: oracle-practice structure-pass count strictly greater than each control; majority of paired blocks favoring oracle against each control (unhealthy or unevaluated attempts count as non-pass); baseline pass rate at or above 0.8 forces `saturated`; any condition with fewer than three effective structure observations forces `insufficient-observations`. Concentration metrics are descriptive only and MUST NOT enter the boolean decision.

#### Scenario: Directional requires count and paired-block majority together

- **WHEN** oracle exceeds both controls in count but not in paired-block majority
- **THEN** the conclusion is `no-discriminability`, never `directional`

#### Scenario: Saturation short-circuits interpretation

- **WHEN** baseline structure-pass rate reaches 0.8
- **THEN** the conclusion is `saturated` regardless of oracle's count

#### Scenario: Too few observations is explicit

- **WHEN** a condition yields fewer than three effective structure observations
- **THEN** the conclusion is `insufficient-observations` and no extra blocks are run

### Requirement: Redacted screen summary with paired-block evidence

The public summary MUST contain per-attempt redacted records (attempt id, condition, session binding, hashes, execution health, semantic labels, structure check labels, raw metrics), the per-block paired comparison table, the four-valued conclusion, and a statement that the screen is diagnostic-only and does not constitute a Practice effect, formal benchmark conclusion, or publication claim. Transcripts and run workspaces MUST stay in git-ignored artifact areas outside the repository.

#### Scenario: Summary stays redacted

- **WHEN** the summary is published to the issue or PR
- **THEN** it contains no transcript content, practice text, credential, or endpoint material
