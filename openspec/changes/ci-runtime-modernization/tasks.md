## 1. Baseline and OpenSpec gate

- [x] 1.1 Verify issue #212, latest `origin/main`, active environment manifests, existing snapshot v2 spec, and current workflow checks; record the final runtime/CI decisions in the issue and design.
- [x] 1.2 Run `openspec validate --all --strict --json` and create the initial PR containing only this change's OpenSpec artifacts and required process metadata.

## 2. Runtime and dependency modernization

- [x] 2.1 Update root package engines and exact Pi dependency to Bun `1.4.2`/Node `24.21.0`/Pi `0.85.1`, regenerate `bun.lock`, and verify `bun install --frozen-lockfile`.
- [x] 2.2 Update formal Pi Dockerfile, active formal/local environment manifests, and runtime documentation/assertions without changing historical incubator condition pins or recorded provenance.
- [x] 2.3 Add deterministic runtime/version consistency checks and run Pi CLI/runner preflight without invoking a model or creating a record.

## 3. Cross-platform snapshot and test stability

- [x] 3.1 Implement a snapshot-scoped canonical text digest for v1 manifests, leaving shared exact-byte `sha256File` and v2 byte-level Merkle semantics unchanged.
- [x] 3.2 Add tests proving LF/CRLF/mixed text workspaces produce the same v1 identity and binary/invalid UTF-8 inputs remain byte-based; preserve private/public exclusion rules.
- [x] 3.3 Make `contract-app.test.ts` subprocess tests use explicit bounded test timeouts and a 30-second synthetic fixture budget while retaining cleanup and formal budget assertions.
- [x] 3.4 Run focused snapshot and runner contract tests and confirm no task/snapshot/record identity outside the intended unrecorded candidate inputs changed.

## 4. CI workflow restructuring

- [x] 4.1 Change the fast validation workflow to PR + main push triggers with concurrency cancellation and exact Bun pin; keep OpenSpec governance and Ubuntu/Windows fast checks.
- [x] 4.2 Split runner/coordinator integration checks into a path-scoped job with explicit job timeout, cleanup behavior, and failure artifacts.
- [x] 4.3 Split formal-container and realistic-repository checks into path-scoped jobs (or equivalent conservative job filters), preserving both test implementations and runtime assertions.
- [x] 4.4 Keep #212 independent of the unmerged #196 candidate; document that its public starter smoke is a follow-up after #196 lands and must not be a required gate here.
- [x] 4.5 Validate changed workflow YAML, inspect PR checks and concurrency behavior, and document old-to-new required-check names.

## 5. Repository verification and handoff

- [x] 5.1 Run `bun run validate`, `bun run test:contracts:core`, runner integration tests, snapshot tests, OpenSpec strict validation, and `git diff --check`.
- [x] 5.2 Build and inspect the formal Pi image, verify exact Bun/Node/Pi versions and no private/model access, and run realistic repository calibration only when its path-scoped workflow applies.
- [x] 5.3 Run public/private leakage and lifecycle audit; confirm no model calls, formal records, suite promotion, historical condition rewrites, node_modules, run workspaces, logs, or generated diffs are committed.
- [x] 5.4 Update issue #212 and PR with root cause, scope, validation evidence, residual infra uncertainty, and the environment-version migration rule.
