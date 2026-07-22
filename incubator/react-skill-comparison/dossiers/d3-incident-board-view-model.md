# D3 — incident board React rows

**Status:** pilot, offline calibrated in the pinned client runtime
**Proposed task:** `incident-board-view-model/v2`
**Skill relevance:** direct
**Pre-registered rule:** `rerender-memo.md`

## Admission sources

- [TanStack Query #6840](https://github.com/TanStack/query/issues/6840):
  derived result references can change unnecessarily across otherwise stable
  query inputs.
- [TanStack Query #9618](https://github.com/TanStack/query/pull/9618):
  derived-combiner invalidation must not preserve stale values.

The task uses an original incident-board domain. Neither its public prompt nor
private evaluator may copy query APIs, patch details, or rule wording.

## Runtime prerequisite

The repository now pins React `19.2.3`, `react-dom` `19.2.3`, and `jsdom`
`26.1.0` under `incubator/react-skill-comparison/react-server-runtime/`. The
client probe creates a real `react-dom/client` root and verifies memo identity
and effect cleanup. D3 must use this runtime; it must not simulate hooks or a
renderer in a plain model.

## Product framing

Implement `useIncidentBoardRows(incidents, statusFilter, selectedId, onSelect)`.
It returns visible rows in input order. Each row contains the source incident,
`isSelected`, and `select()`, which invokes `onSelect` with that row's ID.
The hook is used by an incident board with memoized row components. Inputs are
immutable: a replaced incident is a new object, an unrelated incident may
change, and the filter and selected ID can both change between renders.

The public task describes only the hook's data and interaction contract. It
does not mention memoization, identity, renderer internals, or a rule name.

## Semantic hard gates

- Filtered rows contain exactly the matching incidents in input order.
- The selected flag is correct on every render; a selected ID that is absent
  from the visible filter creates no phantom row.
- `select()` invokes the latest supplied callback with the row's own ID,
  including after the callback changes between renders.
- Replacing one incident never mutates source incidents or changes another
  row's displayed incident.
- Empty filters and an empty incident list have a stable, valid result.

## Deterministic quality probe

The evaluator mounts a harness with the pinned real DOM client renderer. It
feeds hook results into memoized row probes, then updates an unrelated incident,
selection, filter, and callback. It uses render counters and identity
comparisons only, never a wall-clock threshold. After all semantic gates pass,
it awards:

| Probe | Score | Required observation |
| --- | ---: | --- |
| Unaffected row render isolation | 40 | Replacing one visible incident does not rerender memoized probes for unaffected rows. |
| Selection-local identity | 30 | Selection changes rerender only the old and new selected rows; unaffected row objects and callbacks stay identical. |
| Callback freshness | 30 | A stable row callback invokes the latest external callback after rerender without forcing unrelated rows to rerender. |

A semantic failure receives `0` with no probes. Cached rows must never be
mutated in place merely to preserve identity.

## Required mutation resistance

Reject always-rebuilt row objects, callbacks that capture an old external
callback, a cache that mutates rows in place to flip selection, a dependency
set that leaves selection stale, and a reducer that changes an unrelated
incident. Offline calibration must use at least five independent mutations.

## Implementation prerequisites

- Use `evaluator_contract: structured/v2` and report the three named probes.
- Evaluate only through the pinned real DOM client runtime; no mock renderer,
  query library, or network dependency is permitted.
- Reference must pass twice; starter and all five mutations must receive a
  semantic failure or score below `100` before this dossier becomes `pilot`.

## Offline admission gate

1. Confirm public task material can declare only `rerender-memo.md`, and that
   the fixed v2 bundle delivers its complete inline body before editing.
2. Reference must pass twice. Starter and five mutations must each fail a
   semantic or deterministic quality check twice in the real DOM harness.
3. Verify stable results across repeated renderer mounts and full unmount
   cleanup; no test may depend on wall-clock scheduling.
4. Freeze the task, client runtime lockfile, evaluator, source record, rule
   audit, and snapshot before any API request. The first G0 check is a single
   local diagnostic; retire immediately on a baseline ceiling.

## Source abstraction

The source cases demonstrate unstable query result references and stale
combiner invalidation. This is an original React hook contract and DOM harness,
not a copy of query APIs or their fixes.
