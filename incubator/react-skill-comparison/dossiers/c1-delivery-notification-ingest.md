# C1 — delivery notification ingest

**Status:** design only
**Proposed task:** `delivery-notification-ingest/v1`
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

The evaluator supplies a scripted event stream with malformed envelopes,
duplicates, out-of-order timestamps, and valid interleavings. Its logical trace
checks the accepted IDs, state revisions, and notification count. Quality is
the percentage of correctly handled trace transitions after every semantic
assertion passes; it is not a throughput measurement.

## Required mutation resistance

Reject a TypeScript-only type assertion, duplicate overwrite behavior, lexical
timestamp comparison, and an implementation that notifies after a rejected
event.

## Source abstraction

The source cases show that externally controlled payloads need runtime
validation. The task uses a wholly new delivery contract and no source schema,
validation library, or webhook semantics.
