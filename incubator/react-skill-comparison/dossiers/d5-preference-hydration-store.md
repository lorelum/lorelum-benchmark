# D5 — preference hydration store

**Status:** design only
**Proposed task:** `preference-hydration-store/v1`
**Skill relevance:** direct

## Product framing

Implement a preference store for a colour scheme and compact-layout flag. The
store reads one persisted record when first observed, works when storage is
unavailable, and listens for external storage events. It accepts only records
with the declared version and legal preference values. Consumers may subscribe
and read repeatedly before and after hydration.

## Semantic hard gates

- Unavailable storage produces declared defaults without throwing.
- Malformed, unknown-version, and invalid-value records produce defaults and
  must not be reported as a change.
- Valid external records update state only when their normalised value differs.
- Local updates write the canonical record and notify each consumer once.
- Released consumers receive no notification.

## Deterministic quality probe

The evaluator supplies a storage double with `getItem`, `setItem`, and event
counters. It checks one initial read across repeated observations, no duplicate
write/notification for an equivalent external value, and exactly one read
after an explicit invalidation event. Score is computed from counters only
after semantic assertions pass.

## Required mutation resistance

Reject storage reads on every `get`, unconditional notification after malformed
events, SSR-unsafe direct storage access, and updates that write a noncanonical
record.

## Source abstraction

The sources motivate persistence and hydration edge cases. The task supplies a
new record shape and fake storage; it does not copy middleware APIs or fixes.
