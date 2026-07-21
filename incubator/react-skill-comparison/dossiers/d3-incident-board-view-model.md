# D3 — incident board view model

**Status:** design only
**Proposed task:** `incident-board-view-model/v1`
**Skill relevance:** direct

## Product framing

Maintain a view model for an incident board. Inputs are immutable incident
records, a status filter, and a selected incident identifier. Output rows add
`isSelected` and a stable `select` callback. The board supports an update that
replaces one incident and a filter change. Callers depend on unchanged rows and
callbacks retaining identity, but selected state and filtering must never be
stale.

## Semantic hard gates

- Filtered rows contain exactly the matching incidents in input order.
- Selecting a visible incident updates the next view; selecting an absent ID
  clears selection rather than creating a phantom row.
- An update replaces only the named incident and preserves all input records.
- A filter change cannot retain a selection for an invisible incident.
- Public row objects cannot mutate the caller's incident records.

## Deterministic quality probe

The evaluator builds an initial board, selects a row, changes an unrelated
incident, then changes filters. It checks object identity for unchanged rows,
callback identity for unchanged row IDs, and a supplied derivation counter.
The score rewards reuse only when all semantic transitions remain correct;
in-place mutation of a cached row fails the semantic gate.

## Required mutation resistance

Reject always-rebuild output, cached rows mutated to flip selection, callbacks
that capture an old filter, and a reducer that changes an unrelated record.

## Source abstraction

The source cases demonstrate unstable query result references and stale
combiner invalidation. This is an original plain TypeScript domain model, not a
copy of query APIs or their fixes.
