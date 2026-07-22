# Build incident board rows

Implement `useIncidentBoardRows(incidents, statusFilter, selectedId, onSelect)`.
It is used by an incident board that renders one row per returned item.

Return visible incidents in input order. Each returned row exposes the source
incident, `isSelected`, and `select()`. Calling `select()` must invoke the
latest supplied `onSelect` with that row's ID. A selected ID outside the
visible filter must not produce a row or select a different incident.

The input array and incident objects are immutable. Between renders one
incident may be replaced with a new object, the filter or selected ID may
change, and the supplied callback may change. Empty inputs and filters are
valid. Do not mutate inputs, add dependencies, use I/O, or change exports.
