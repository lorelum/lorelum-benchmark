# Spec Delta

## MODIFIED Requirements

### Requirement: Exact runtime identity is synchronized

The repository MUST declare and validate exact baseline Bun, Node and Pi versions for the active development, CI and formal paths. The package manifest, lockfile, formal image, active environment manifests, documentation and CI assertions MUST agree. Runtime upgrades MUST create new active environment versions and MUST NOT rewrite the identity of historical environments or records.

#### Scenario: Fresh install resolves the declared runtime
- **WHEN** a clean checkout runs the frozen dependency installation and runtime preflight
- **THEN** dependency resolution succeeds and Bun, Node and Pi report the exact declared versions without a model call

#### Scenario: Historical environment remains interpretable
- **WHEN** a new runtime is activated
- **THEN** the prior environment versions and their recorded runtime identities remain unchanged
