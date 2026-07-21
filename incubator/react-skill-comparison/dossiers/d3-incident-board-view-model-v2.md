# D3 — incident board view model v2

**Status:** retired after public routing failure
**Proposed task:** `incident-board-view-model/v2`
**Relevance target:** direct

## Public product contract

Build an incident board from immutable incidents, a status filter, and a
selected incident identifier. The board returns filtered rows with selection
callbacks. Replacing one incident must leave unrelated visible rows and their
callbacks unchanged by identity while correctly updating affected rows. Filter
changes must not retain an invisible selection.

The product contract exposes identity and derivation observations, never a
rule name, memo helper, or framework API.

## Offline quality design

- A supplied derivation counter distinguishes recomputing every row from
  recomputing only changed or filter-affected rows.
- Identity probes cover untouched rows and callbacks after an unrelated update.
- Semantic gates cover ordering, filter correctness, immutable inputs, and
  clearing invalid selection.
- Mutations: rebuild every row, stale callback closure, in-place cached-row
  mutation, and unrelated-record mutation.

## Admission gate

Use a temporary public draft to verify complete router coverage before private
evaluator construction. Promote only after twice-repeatable reference results,
starter failure, and all three mutations are rejected.

## Routing result

On 2026-07-21, `public-bm25/v1` did not select the independently audited
derived-state and identity mechanisms in its three-rule context. This draft is
retired before evaluator construction and must not become `v2`.
