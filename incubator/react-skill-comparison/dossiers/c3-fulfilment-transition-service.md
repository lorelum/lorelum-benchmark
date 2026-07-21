# C3 — fulfilment transition service

**Status:** admitted to offline-calibrated pilot
**Task:** `fulfilment-transition-service/v1`
**Skill relevance:** control

## Product framing

Implement an order-fulfilment transition service. Orders begin in `draft`, may
be reserved, dispatched, fulfilled, or failed. A terminal fulfilled or failed
order cannot transition again. Dispatch invokes an injected carrier service;
its rejection must move the order to `failed` with the original cause
available to the caller and no false dispatch confirmation.

## Semantic hard gates

- Permit only the declared transitions and leave an order unchanged after an
  invalid transition.
- Terminal orders reject later commands without invoking the carrier.
- Dispatch calls the carrier once for a valid reserved order and records its
  tracking value on success.
- A carrier rejection records the declared failed state and preserves the
  original error object.
- Repeating the same dispatch command while pending shares one carrier call and
  resolves callers consistently.

## Deterministic quality probe

The evaluator drives a logical command trace with deferred carrier resolution
and rejection. After semantic gates pass, it scores valid transition coverage,
one-call pending dispatch behavior, and terminal-state side-effect avoidance.
It never uses elapsed time or a performance threshold.

## Required mutation resistance

Reject a transition from a terminal state, a swallowed carrier error, two
carrier calls for concurrent dispatch, and a mutation that marks dispatch as
successful before the carrier resolves.

## Source abstraction

The source cases motivate terminal-state and asynchronous error behavior. This
task uses an original order graph, command names, and error contract rather
than state-machine APIs or the source fixes.

## Offline calibration

On 2026-07-21, the private reference passed every semantic gate and received a
`100` quality score. The public starter failed, and four plausible mutations
were each rejected: a transition from a terminal state, swallowed carrier
error, duplicate pending dispatch, and premature dispatched state. The revision
snapshot was then written. This task is a control: it is reported separately
and cannot be used in the direct-task effect estimate.
