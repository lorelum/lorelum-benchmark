# Reuse Card — Local Query Kernel

- **Task kernel ID:** `tk-local-query-draft`
- **Capability tags:** `deterministic-query`, `filtering`, `pagination-boundary`
- **Functional oracle:** preserve compatible query responses and distinguish request
  outcomes required by the real caller.
- **Eligible profiles:** none until source review confirms a relevant Practice.
- **Ineligible profiles:** historical query seeds and unrelated ranking/explanation
  drafts; they do not provide an independently explainable intervention.
- **Shared fixtures/evaluator:** local items and query fixtures are draft material.
- **Profile-specific adherence checks:** selection semantics and response stability
  must be scored only by the approved profile's probes.
- **Leakage risks:** sorting, filter normalization, and pagination sequence are
  potential profile details and must not be stated as implementation instructions.
- **Frozen snapshot:** absent by design while source-gated.
- **Reuse decision:** not reusable yet.
