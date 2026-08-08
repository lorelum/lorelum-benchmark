## ADDED Requirements

### Requirement: Realistic task statements do not hard-code fixture paths

For real-development-style candidates, the public task statement MUST describe
the product goal in natural language and MUST NOT hard-code API documentation
paths, test fixture paths, or benchmark-specific language. API contract and
test entry points are determined by the starter's actual content. Private
evaluators MUST verify only the observable behavior declared by the task
statement; layering, UI/UX, and form-quality dimensions are soft quality
signals and MUST NOT become semantic hard gates.

#### Scenario: Agent inspects real project content
- **WHEN** a candidate task says to inspect the existing login API and wire up
  the login page
- **THEN** the agent finds the API contract and tests in the starter, and the
  evaluator verifies only the declared observable behavior

#### Scenario: Reference layout is not a hard gate
- **WHEN** a candidate uses different file paths, helper names, or directory
  layout from the reference
- **THEN** the quality probe accepts responsibility-equivalent implementations
  and does not mark the task incomplete