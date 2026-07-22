# D5 — preference hydration store v2

**Status:** candidate, offline design only
**Proposed task:** `preference-hydration-store/v2`
**Relevance target:** direct

## Why v2

The retired v1 checks one initial read but does not distinguish a cache that
stays stale after an external update from one that correctly invalidates and
refreshes. V2 keeps the original product domain while making that observable
without an external service or wall-clock threshold.

## Public contract

The store manages versioned workspace display preferences. Repeated reads use
one persisted record until an external change for that key arrives. A valid
external change invalidates the cached record, refreshes it once, and notifies
subscribers only if the normalized value changed. Events for other keys,
malformed records, unavailable storage, and equivalent values cause no write
or notification. Local updates persist one canonical record, update the cache,
and notify once. Released subscribers never receive updates.

The public task text names no rule, cache data structure, storage API recipe,
or source implementation. Its public task card declares `js-cache-storage.md`.

## Evaluator and admission

Semantic gates cover schema validation, unavailable storage, idempotent
release, canonical writes, and external-value normalization. After they pass,
score 100 from deterministic counters: 40 for one initial read across repeated
gets, 35 for one refresh after a relevant external invalidation, and 25 for no
read/write/notification on irrelevant or equivalent events.

Reject read-on-every-get, cache-without-external-invalidation, global cache
shared across store instances, unconditional external notification, and
noncanonical local writes. Reference passes twice; starter and five mutations
fail twice; public rule calibration, snapshot, fixtures, contracts, and
validation must pass before pilot. A first 100/100 pair retires the revision
for ceiling effect.
