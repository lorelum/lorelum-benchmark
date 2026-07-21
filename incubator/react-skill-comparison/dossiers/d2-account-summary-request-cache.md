# D2 — account summary request cache

**Status:** design only
**Proposed task:** `account-summary-request-cache/v1`
**Skill relevance:** direct

## Product framing

Implement a request-scoped account-summary service. A request context may ask
for the same trimmed account identifier through several cards. Within that
context, equal valid identifiers must observe one in-flight account read and
one result. A later independent request context must perform its own read.

The service composes an account record with a permissions record. A missing
account returns `null`; a rejected account or permissions read is propagated.
Failed reads must not poison a later retry in the same request context.

## Semantic hard gates

- Blank identifiers return `null` without touching either repository method.
- Account and permissions data map to the declared public summary shape.
- A missing account does not request permissions.
- Permission failures preserve their original error object.
- A rejected entry is removable so a subsequent call can retry.

## Deterministic quality probe

The evaluator provides a controllable repository and creates three concurrent
same-context callers, then a caller in another context. It scores only after
the semantic gates pass:

- exactly one account read and one permissions read occur for the concurrent
  same-context callers;
- all same-context callers receive the same resolved summary object;
- the second context performs a new pair of reads; and
- a rejected first read increments the next attempt rather than returning its
  prior rejected promise.

## Required mutation resistance

Reject a no-cache implementation, a module-global cache shared by contexts,
an implementation that caches rejections forever, and one that reads
permissions for a missing account.

## Source abstraction

The source cases concern duplicate reads and unstable deduplicated promises.
The task uses an original request-context interface; it does not expose SWR
names, options, or implementation details.
