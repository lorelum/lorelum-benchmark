# D6 — report export boundary

**Status:** design only
**Proposed task:** `report-export-boundary/v1`
**Skill relevance:** direct

## Product framing

Implement the report-screen controller for a viewer, report metadata, and an
optional export capability. The normal summary is available to authorised
viewers. The export screen is available only when the viewer has export
permission, the report allows exports, and the caller explicitly opens export.
The expensive export renderer is supplied through an injectable module loader.

## Semantic hard gates

- Anonymous and unauthorised viewers receive the declared safe result without
  loading or exposing export data.
- A report with exports disabled never exposes an export action.
- An authorised explicit open loads the renderer and returns its declared
  result; loader errors retain identity.
- Repeated open requests while a load is pending share the result for that
  controller instance.

## Deterministic quality probe

The evaluator replaces the loader with a deferred function and asserts zero
calls for all non-export paths, one call for concurrent authorised opens, and a
new call for a distinct controller instance. It observes call counts rather
than chunks, bytes, or elapsed time.

## Required mutation resistance

Reject an eager top-level load, permission checks after loading, a global cache
shared between viewers, and a wrapper that replaces loader errors.

## Source abstraction

The source cases establish that optional code can become eager or leak into
unrelated routes. The task does not mention dynamic-import APIs, build tools,
or source route names.
