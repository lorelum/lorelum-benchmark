## MODIFIED Requirements

### Requirement: Profile diagnostic health requires successful evaluator completion

The profile diagnostic runner MUST record `evaluation_status=evaluated` only
when the evaluator process completes without timeout, launch failure, or
WebServer startup failure, exits with code zero, and emits a valid complete
structured diagnostic result. Semantic and Practice observation fields MUST
NOT be inferred from evaluator stdout when the evaluator process is non-healthy.

WebServer launch failure, dependency failure, port conflict, and evaluator
timeout MUST be classified as `execution-failed` with a stable redacted reason
and MUST NOT produce semantic, Practice observation, or joint-pass fields.

#### Scenario: Structured output followed by a nonzero evaluator exit
- **WHEN** an evaluator emits a syntactically valid diagnostic result but exits
  with a nonzero code
- **THEN** the runner MUST record `evaluation_status=execution-failed` with a
  stable redacted reason and omit semantic, Practice observation, and joint
  pass fields

#### Scenario: Successful evaluator with a semantic failure
- **WHEN** an evaluator exits with code zero and emits `semantic=fail` with a
  valid Practice observation state
- **THEN** the runner MUST record `evaluation_status=evaluated`, preserve both
  result dimensions, and derive joint pass as false

#### Scenario: Successful evaluator with invalid output
- **WHEN** an evaluator exits with code zero but does not emit a complete
  structured diagnostic result
- **THEN** the runner MUST record `evaluation_status=invalid-output` and MUST
  NOT infer semantic, Practice observation, or joint pass fields

#### Scenario: WebServer launch failure is not a semantic result
- **WHEN** the attempt WebServer fails to start or a port conflict occurs
- **THEN** the runner MUST record `execution-failed` with a stable redacted
  category and MUST NOT emit semantic, Practice observation, or joint-pass
  fields