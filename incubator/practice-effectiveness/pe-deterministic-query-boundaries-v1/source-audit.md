# Source Audit — Local Query Kernel

## Status

`blocked`: this fixture is a contract-derived query draft, not a record of a real
caller, query contract, or production boundary.

## Required evidence before candidate admission

- A real repository path or PR/incident/review that establishes supported request
  inputs, response compatibility, and the caller's distinction between invalid and
  empty results.
- A team-confirmed, versioned Practice relevant to that exact selection boundary,
  including its owner and exclusions.
- Evidence that ordering, pagination, and aggregate response behavior are product
  requirements rather than evaluator-invented preferences.
- A baseline failure hypothesis that does not expose the selected Practice in the
  public task prompt.

## Runtime risks

The draft is local-only and excludes network calls, clocks, databases, locale defaults,
and mutable process state. Any promotion must keep those controls or provide a stable
local substitute.
