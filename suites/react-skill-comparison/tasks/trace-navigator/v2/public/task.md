# Build a trace navigator

Implement `createTraceNavigator(rows)`. It owns one ordered trace-row snapshot.
Each row has a non-empty `spanId`, an optional `parentSpanId`, and a `visible`
flag.

The returned navigator must provide these methods:

- `locate(spanId)`: return the zero-based row position, or `null` for a blank
  or absent identifier.
- `parentOf(spanId)`: return the parent row position, `null` for a root row,
  and `null` for an absent identifier.
- `step(spanId, direction)`: for a visible current row, return the nearest
  visible row in the requested `"next"` or `"previous"` direction as
  `{ spanId, position }`. Return `null` at a boundary, for an absent span, or
  for a hidden current row.
- `replace(rows)`: atomically install a new valid snapshot.

Rows preserve their supplied order. A row may name a parent only when that
parent exists in the same snapshot. Reject blank, duplicate, or non-string
span identifiers, and reject a blank, non-string, or missing parent reference.
If construction or replacement rejects a snapshot, the currently observable
navigator state must remain unchanged. The navigator owns an independent
snapshot: after construction or a successful replacement, later caller changes
to the supplied rows array or any supplied row object must not change any
navigation result. Do not mutate inputs, add dependencies, or use I/O or
module-global state.
