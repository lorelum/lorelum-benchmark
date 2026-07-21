# Source Audit — Configuration Validation Kernel

## Status

`blocked`: this fixture is a contract-derived draft, not a source-backed record of a
team configuration boundary or diagnostic contract.

## Required evidence before candidate admission

- A real repository change, PR, incident, or review documenting the configuration
  consumer, compatibility requirements, and observable failure behavior.
- A team-confirmed, versioned Practice that applies at the same boundary, including
  owner, review state, and exclusions.
- Evidence for any issue representation, aggregation, redaction, or partial-result
  policy. These requirements cannot be invented by the evaluator.
- A source-derived baseline failure hypothesis that can be probed without writing the
  Practice's rule text into the public prompt.

## Runtime risks

The draft is local-only and excludes network access, clocks, secrets, absolute machine
paths, and mutable input. Promotion must retain deterministic local fixtures.
