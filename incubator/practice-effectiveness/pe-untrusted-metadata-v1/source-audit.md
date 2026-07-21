# Source Audit — Plugin Metadata Loader Kernel

## Status

`blocked`: this executable fixture is a contract-derived draft. It must not be
promoted, used as an Oracle intervention, or presented as evidence of a team Practice.

## Required evidence before candidate admission

- A repository path or PR/incident/review record showing a real plugin-metadata load
  boundary and the affected consumer contract.
- A team-confirmed, versioned Practice that applies to that boundary, including its
  owner, review state, and explicit exclusions.
- Evidence that the diagnostic consumer requires the selected fields and compatibility
  behavior; the fixture must not invent those requirements.
- A source-derived reason baseline agents can miss the rule without exposing it in the
  public prompt.

## Profile gate

Each admitted profile must record its own source, Oracle content revision, matched
irrelevant control, adherence probes, and conclusion boundary. A profile about input
trust and a profile about diagnostic delivery are not interchangeable merely because
they touch the same loader.

## Runtime risks

The current draft is local-only and excludes network access, clocks, external plugin
registries, and production metadata. Any real-source fixture must preserve those
limits or document a deterministic local substitute.
