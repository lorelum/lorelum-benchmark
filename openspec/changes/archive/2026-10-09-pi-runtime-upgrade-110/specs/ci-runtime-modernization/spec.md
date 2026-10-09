## MODIFIED Requirements

### Requirement: Exact runtime identity is synchronized

The repository MUST declare and validate one exact baseline runtime for the active development/CI/formal Pi path: Bun `1.4.2`, Node `24.21.0`, and `@earendil-works/pi-coding-agent` `1.1.0`. The package manifest, lockfile, formal image, active environment manifests (`formal-pi-deepseek-v4-pro/v3`, `local-pi/v4`, and `local-wsl-pi/v4`), docs, and CI assertions MUST agree. Existing environment versions (including `formal-pi-deepseek-v4-pro/v2`, `local-pi/v3`, and `local-wsl-pi/v3`) and historical incubator condition pins MUST NOT be rewritten by this change.

#### Scenario: Fresh install resolves the declared runtime

- **WHEN** a clean checkout runs `bun install --frozen-lockfile` and the runtime preflight
- **THEN** dependency resolution succeeds and Bun/Node/Pi report the exact declared versions (`1.4.2`, `24.21.0`, `1.1.0`) without a model call
