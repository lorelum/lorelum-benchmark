# Source Audit — Pack Publication Kernel

## Status

`blocked`: the repository currently has no source-backed pack ownership, entrypoint,
export, or dependency-direction contract. This fixture is a contract-derived draft.

## Required evidence before candidate admission

- A real repository path or PR/incident/review that establishes a pack publication
  workflow, ownership model, and the consumer affected by invalid declarations.
- A team-confirmed, versioned Practice for that workflow, including owner, review
  state, and explicit exclusions.
- Evidence for each selected compatibility rule. A generic module-graph preference is
  insufficient to make a pack/domain product contract.
- A source-derived baseline failure hypothesis and a public prompt abstraction that do
  not disclose the Practice's checks.

## Runtime risks

The draft intentionally excludes network resolution, package installation, arbitrary
code execution, clocks, and external package registries. A real-source fixture must
retain those protections through local frozen facts.
