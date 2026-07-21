# D3 — incident board view model

**Status:** design only
**Proposed task:** `incident-board-view-model/v1`
**Skill relevance:** direct
**Pre-registered rules:** `rerender-derived-state.md`, `rerender-memo.md`

## Admission sources

- [TanStack Query #6840](https://github.com/TanStack/query/issues/6840):
  derived result references can change unnecessarily across otherwise stable
  query inputs.
- [TanStack Query #9618](https://github.com/TanStack/query/pull/9618):
  derived-combiner invalidation must not preserve stale values.

The task uses an original incident-board domain. Neither its public prompt nor
private evaluator may copy query APIs, patch details, or rule wording.

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

The evaluator builds an initial board, selects a row, replaces an unrelated
incident, then changes filters. It uses only identity comparisons and a
supplied derivation counter—never wall-clock time. After all semantic gates
pass, it awards:

| Probe | Score | Required observation |
| --- | ---: | --- |
| Stable unaffected rows | 40 | Replacing one incident preserves object identity for unaffected visible rows. |
| Stable callbacks | 30 | An unchanged visible row retains its `select` callback identity. |
| Bounded derivation | 30 | The derivation counter changes only for the replaced/filter-affected rows. |

A semantic failure receives `0` with no probes. Cached rows must never be
mutated in place merely to preserve identity.

## Required mutation resistance

Reject always-rebuild output, cached rows mutated to flip selection, callbacks
that capture an old filter, and a reducer that changes an unrelated record.
Offline calibration must use at least three independent candidates: always
rebuild, stale callback, and in-place cached-row mutation.

## Implementation prerequisites

- Use `evaluator_contract: structured/v2` and report the three named probes.
- Implement a plain Bun/TypeScript model with no React, query-library, or
  network dependency; the task measures observable model identity, not a
  framework helper.
- Reference must pass twice; starter and all three mutations must receive a
  semantic failure or score below `100` before this dossier becomes `pilot`.

## Source abstraction

The source cases demonstrate unstable query result references and stale
combiner invalidation. This is an original plain TypeScript domain model, not a
copy of query APIs or their fixes.
