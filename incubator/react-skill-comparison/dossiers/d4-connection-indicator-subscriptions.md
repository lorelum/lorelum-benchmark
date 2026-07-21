# D4 — connection indicator subscriptions

**Status:** design only
**Proposed task:** `connection-indicator-subscriptions/v1`
**Skill relevance:** direct

## Product framing

Provide subscriptions for screen instances showing one process-wide connection
state. Consumers can subscribe, unsubscribe more than once, and subscribe
during a notification. The underlying event source accepts a listener and
returns a release function. Only one underlying listener may exist while at
least one consumer is active.

## Semantic hard gates

- A new consumer receives the current valid connection state immediately.
- Invalid event values do not alter state or notify consumers.
- A consumer receives each valid state change at most once.
- Unsubscribe is idempotent and a released consumer receives no later update.
- A consumer added during delivery does not receive the event already in
  progress, but does receive subsequent valid events.

## Deterministic quality probe

A fake event source exposes add/remove counters and a controlled dispatch
queue. The evaluator subscribes and remounts several consumers, releases them
in different orders, and verifies one add while occupied, one remove after the
final release, and no listener accumulation across a second lifecycle.

## Required mutation resistance

Reject one-listener-per-consumer, missing final cleanup, duplicate release of
the source listener, and iteration that incorrectly delivers an in-progress
event to a newly added subscriber.

## Source abstraction

The source cases establish that remounting can accumulate listeners. The task
does not reuse their event systems, component structure, or cleanup code.
