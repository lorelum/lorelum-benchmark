# C1 — delivery notification ingest

**Status:** admitted to offline-calibrated pilot
**Task:** `delivery-notification-ingest/v2`
**Skill relevance:** control

## Product framing

Implement a delivery-notification ingestor. It accepts externally supplied
objects and produces an immutable list of delivery updates. A valid event has a
nonempty ID, a recognised type, a valid ISO timestamp, and a payload whose
fields match that type. Duplicate IDs are ignored. Events older than the last
accepted update for the same delivery do not move the delivery backwards.

## Semantic hard gates

- Reject nonobjects, malformed values, unknown types, invalid timestamps, and
  invalid payload fields without changing state.
- Preserve first-seen event order for valid distinct delivery IDs.
- Treat duplicate IDs as no-ops even when their payload differs.
- Ignore a valid but older update for the same delivery.
- Expose readonly snapshots that cannot change the ingestor's internal state.

## Deterministic quality probe

The structured evaluator first applies all semantic gates. Only after those
pass, it scores two deterministic dynamic probes: an unknown status must be
rejected before its `details` getter is read, and a subscriber registered while
an accepted update is being delivered must observe only the next update. These
are access and delivery traces, not throughput measurements or wall-clock
thresholds.

## Required mutation resistance

Reject a TypeScript-only type assertion, duplicate overwrite behavior, lexical
timestamp comparison, and live subscriber-set iteration.

## Offline calibration

On 2026-07-21, the private reference passed every semantic gate and received a
`100` quality score. The public starter failed, and four plausible mutations
were each rejected: static type assertion, duplicate overwrite, lexical
timestamp comparison, and live subscriber iteration. The revision snapshot was
then written. This task is a control: it is reported separately and cannot be
used in the direct-task effect estimate.

## Source abstraction

The source cases show that externally controlled payloads need runtime
validation. The task uses a wholly new delivery contract and no source schema,
validation library, or webhook semantics.
