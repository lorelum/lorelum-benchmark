## ADDED Requirements

### Requirement: Runner uses three predeclared delivery nodes

The Pi v2 staged delivery runner MUST declare and validate exactly these ordered
nodes for the timing protocol: `task_start`, `constraint_followup`, and
`first_implementation_checkpoint`. A node MUST be associated with an explicit
script/adapter boundary; the runner MUST NOT infer it from wall-clock delay,
turn count, token count, workspace file signals, or intent recognition.

#### Scenario: Valid three-node plan is accepted

- **WHEN** a staged timing plan declares the three nodes in the required order
  and each node has an explicit control-plane acknowledgement
- **THEN** the runner accepts the plan before creating an Agent workspace or
  delivering a Practice card

#### Scenario: Ambiguous node is rejected

- **WHEN** a plan omits a node, reorders nodes, or uses a delay/file/intent
  heuristic instead of an explicit acknowledgement
- **THEN** the runner records an invalid-plan or unsupported outcome and does
  not deliver the Practice early

### Requirement: Delivery preserves one Agent session

The runner MUST create one Agent session for an attempt and MUST deliver all
eligible timing-node events through that session. It MUST NOT restart the
session, clone the workspace, or use artificial waiting/token padding to
simulate a delivery node. A session id mismatch or unconfirmed continuation
MUST be execution-unhealthy and MUST stop subsequent delivery.

#### Scenario: Three nodes share the same session

- **WHEN** an eligible treatment condition reaches all three acknowledged nodes
- **THEN** every delivery audit event records the same session id and the Agent
  receives the same fixed Practice body bytes at each declared node

#### Scenario: Session continuity fails closed

- **WHEN** the continuation returns a different session id or cannot prove it
  resumed the original session
- **THEN** the runner records `session-resume` failure and does not deliver a
  later node as if continuity were intact

### Requirement: Runner consumes one fixed Pack-sourced treatment

Before execution the runner MUST consume the frozen #199 treatment metadata and
payload only after validating its treatment version, Pack repository/ref/version/
commit, Practice ID, source path, Lore content digest, source SHA-256 and card
body SHA-256. The runner MUST NOT call Lore query/get, rerank candidates, replace
payloads, or resolve a different Practice during an attempt or between nodes.

#### Scenario: Fixed treatment identity is reused

- **WHEN** the preflight payload passes all declared identity and byte/hash checks
- **THEN** all declared treatment nodes use the same Practice ID and card body
  hash, and the audit trace links them to the same frozen Pack provenance

#### Scenario: Treatment drift is detected

- **WHEN** the payload, metadata, Practice body, or Pack identity differs from
  the frozen declaration
- **THEN** preflight returns an explicit failed/indeterminate outcome and sends
  no Practice card to the Agent

### Requirement: Delivery is condition-scoped and isolated

The runner MUST deliver a Practice card only when the current condition declares
that treatment and the current node is one of the pre-registered nodes. Baseline
and every undeclared condition MUST receive no Practice payload. Private
 evaluator, oracle, calibration, scoring and Pack-wide material MUST NOT be
 copied into the Agent workspace, prompt, stdout trace, or public artifacts.

#### Scenario: Declared condition receives delivery

- **WHEN** a treatment condition reaches a validated declared node
- **THEN** the private runtime delivers only the fixed Practice card and records
  the node outcome without materializing the card in the Agent workspace

#### Scenario: Baseline remains isolated

- **WHEN** baseline or an undeclared condition reaches a timing node
- **THEN** the runtime returns no Practice payload, records an explicit isolation
  result, and the Agent-visible input contains no Practice text or private path

### Requirement: Audit trace proves actual delivery without private leakage

Each delivery attempt MUST produce a structured private audit event containing
attempt/session identity, stage, condition, fixed treatment identity, Pack
provenance, Practice/card hash, node acknowledgement, and delivery outcome.
Agent/public traces MUST be redacted to the minimum fields needed for execution
inspection and MUST NOT include Practice text, Practice ID, card hash, full Pack
provenance, Pack root/store path, private evaluator/oracle/scoring material, or
workspace paths.

#### Scenario: Audit records all three nodes

- **WHEN** all three declared nodes complete for one eligible condition
- **THEN** the private sidecar contains three ordered events with equal treatment
  identity/body hash and explicit success outcomes

#### Scenario: Public trace is redacted

- **WHEN** the runner serializes delivery trace for Agent/public consumption
- **THEN** it contains only allowed stage/condition/treatment-version/status
  fields and contains none of the private identity, path, body, or oracle data

### Requirement: Unsupported or failed delivery MUST fail closed

The runner MUST fail closed for delivery failures. If a declared node is unavailable, an acknowledgement is missing, a card
payload is corrupted, a session cannot continue, or isolation is violated, the
runner MUST record an explicit `failed`, `unsupported`, or `indeterminate`
outcome. It MUST NOT silently move the Practice to another node, deliver a
fallback Practice, or claim that a condition received the treatment.

#### Scenario: Node is unsupported

- **WHEN** the host cannot acknowledge the predeclared node before delivery
- **THEN** the runner records `unsupported` or `indeterminate`, sends no card at
  another node, and marks the attempt non-comparable

#### Scenario: Delivery failure stops later nodes

- **WHEN** a delivery call fails or its outcome cannot be verified
- **THEN** the runner records the failure and does not deliver a later node as a
  successful continuation of the same timing condition

### Requirement: Contract is verified offline

The change MUST provide deterministic mock/fixture tests for node ordering,
session continuity, fixed identity/hash reuse, delivery failure, unsupported and
indeterminate outcomes, baseline/undeclared isolation, and public/private
redaction. The tests MUST NOT call an external model, Lore network, semantic
query, or create a formal benchmark record.

#### Scenario: Mock protocol exercises the complete path

- **WHEN** the contract test suite runs with a mock Pi session and fixed treatment
  fixture
- **THEN** it verifies the three-node sequence, same-session identity, hash
  consistency and trace redaction without network or model calls

#### Scenario: Negative fixtures remain explicit

- **WHEN** a mock fixture mutates the payload, changes the session id, removes a
  node acknowledgement, or requests delivery for baseline
- **THEN** the test observes the corresponding fail-closed/isolation outcome and
  no later successful treatment delivery is inferred