## ADDED Requirements

### Requirement: Each diagnostic attempt isolates its evaluator WebServer and cleans up child processes

The profile diagnostic runner MUST give each attempt an isolated evaluator
WebServer port so consecutive attempts do not conflict, and MUST clean up the
WebServer and Playwright workers on evaluator exit, failure, and timeout.
Cleanup MUST use the repository's verified process-tree termination on Windows
(`taskkill /T /F`) and Linux (recursive parent scan + SIGTERM). When cleanup
cannot be confirmed, the attempt MUST be recorded as `execution-failed` and
MUST NOT enter semantic, Practice, or joint-pass comparison.

#### Scenario: Consecutive attempts do not reuse a busy port
- **WHEN** an earlier attempt leaves a WebServer running and a later attempt starts
- **THEN** the later attempt uses an isolated port or the runner terminates the
  leftover server; it never reports the leftover as a candidate or Practice failure

#### Scenario: Evaluator timeout terminates the server tree
- **WHEN** an evaluator exceeds its attempt budget
- **THEN** the runner terminates the evaluator and WebServer process tree and
  records a stable timeout category without a semantic result

#### Scenario: Unconfirmed cleanup blocks comparison
- **WHEN** the runner cannot confirm the WebServer port was released
- **THEN** the attempt is recorded as `execution-failed` and is excluded from
  semantic, Practice, and joint-pass comparison