# Capability: pack-sourced-practice-treatment

## ADDED Requirements

### Requirement: Fixed Pack provenance and Practice identity

The benchmark MUST represent a Pack-sourced Practice treatment with a versioned identity that fixes
the Pack repository, release ref, resolved commit, Pack version, Practice ID, source path, Lore
`contentDigest`, and canonical Practice body SHA-256. A missing, malformed, or mismatched identity
MUST fail closed; the resolver MUST NOT replace it with the Registry latest release or another query
candidate.

#### Scenario: Pinned identity is accepted

- **WHEN** a preparation fixture contains the declared repository, ref, commit, version, Practice ID,
  source path, content digest, and body bytes whose SHA-256 matches the manifest
- **THEN** the resolver returns one immutable treatment payload and its audit provenance

#### Scenario: Upstream identity drifts

- **WHEN** the ref, resolved commit, Practice ID, source path, content digest, or body SHA-256 differs
  from the declared contract
- **THEN** preparation fails closed and does not select a replacement Practice or latest release

### Requirement: One-time selection and immutable runtime payload

The system MUST freeze the treatment selection before a benchmark run.

The treatment selection MAY use one natural-language semantic query and one exact Practice read during
preparation, but every benchmark run MUST consume the resulting fixed payload. The run path MUST NOT
query, rerank, re-resolve, or select a different Practice per condition, delivery node, session, or
retry. The fixed payload and its identity MUST be suitable for byte-for-byte comparison across all
three timing nodes.

#### Scenario: Preparation freezes a payload

- **WHEN** the resolver receives the approved query/get fixture once and writes the versioned payload
- **THEN** later delivery calls reuse the same payload without invoking query/get again

#### Scenario: Runtime attempts to re-resolve

- **WHEN** a delivery request lacks the prepared payload or asks for a new query result
- **THEN** delivery returns an explicit failure/indeterminate outcome and does not silently re-resolve

### Requirement: Scope-changed applicability evidence

The treatment MUST include private, versioned applicability evidence connecting the selected Practice's
`applies_when` to the async-report `scope_changed` scenario: a previously accepted plan is changed by
new compatibility, concurrent old/new operation, and rollback facts, which changes delivered behavior,
risk, or required verification. This evidence MUST be deterministic and reviewable without turning
natural-language query ranking into an evaluated outcome.

#### Scenario: Applicability basis matches the task event

- **WHEN** the private fixture records the new compatibility, old/new concurrency, rollback, and
  verification-impact facts and the selected Practice's `applies_when` evidence references them
- **THEN** the applicability validator accepts the treatment without scoring query ranking

#### Scenario: Applicability basis is incomplete

- **WHEN** the fixture omits a material scope, risk, or verification change required by the scenario
- **THEN** preparation rejects the treatment as not applicable

### Requirement: Practice-card isolation

The treatment MUST use the condition-scoped private runtime `practice-card` delivery form. The Practice
body MUST NOT be materialized in `public/`, the public task prompt, the starter, or the Agent workspace.
The baseline and every condition that does not declare the treatment MUST receive no Practice payload.
Private evaluator, oracle, calibration, scoring, and Pack-wide material MUST NOT be copied into the
payload or any Agent-visible input.

#### Scenario: Declared timing node receives the card

- **WHEN** a declared timing node requests delivery with the prepared treatment
- **THEN** the private runtime receives the card body and stable treatment identity without writing a
  Practice file into the Agent workspace

#### Scenario: Baseline or undeclared condition requests delivery

- **WHEN** baseline or an undeclared condition requests a treatment payload
- **THEN** the runtime returns no Practice payload and records an explicit isolation result

### Requirement: Delivery and audit provenance

A delivery record MUST expose to the runner only the minimum stable metadata needed to deliver the
selected card and to record treatment identity and delivery status. Practice-specific identity such as the
Practice ID and card hash MUST remain in a non-Agent audit sidecar, which MUST preserve the
full Pack provenance, selection provenance, applicability evidence identity, and the fact that all
three timing nodes used the same Practice ID and body hash. Public traces and logs MUST NOT expose the
full Pack provenance or Practice body.

#### Scenario: Audit sidecar records same identity at every node

- **WHEN** the three declared timing nodes complete delivery using the prepared payload
- **THEN** the audit sidecar records the same Practice ID and body hash for each node and preserves the
  Pack ref/version/commit separately from the Agent-visible trace

#### Scenario: Public trace is redacted

- **WHEN** a delivery trace is serialized for Agent/public consumption
- **THEN** it contains only treatment identity and delivery status, with no Practice ID, card hash,
  Practice body, Pack root, Store path, or full Pack provenance

### Requirement: Fail-closed delivery outcomes

The contract MUST fail closed for any missing, corrupted, hash-mismatched, wrong-ref, or unavailable fixed payload.

If the fixed payload is missing, corrupted, hash-mismatched, from the wrong ref, or unavailable at a
predeclared delivery node, the contract MUST return an explicit failed/unsupported/indeterminate
outcome. It MUST NOT silently deliver a different Practice, move delivery to another node, or claim
that a timing condition received the treatment.

#### Scenario: Payload corruption is detected

- **WHEN** a delivery payload's bytes no longer match its declared body SHA-256
- **THEN** delivery returns `failed` or `indeterminate` and sends no card to the Agent

#### Scenario: Node is unsupported

- **WHEN** the host cannot deliver at the predeclared node
- **THEN** the trace records `unsupported`/`indeterminate` and does not deliver early or at a later node

### Requirement: Deterministic verification boundary

The change MUST provide mock/fixture tests that verify fixed identity, byte/hash consistency across
three delivery nodes, baseline isolation, undeclared-condition isolation, applicability evidence,
private/public boundary, and rejection of drift. The tests MUST NOT call an external model or create a
formal benchmark record.

#### Scenario: Contract tests run offline

- **WHEN** the contract test suite runs with mock query/get and delivery fixtures
- **THEN** it verifies identity, isolation, same-content delivery, drift rejection, and failure states
  without model calls, network access, formal records, or suite promotion
