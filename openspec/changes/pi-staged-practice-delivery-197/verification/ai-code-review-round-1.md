# AI code review — round 1

Date: 2026-09-16
Scope: `origin/main...codex/pi-staged-practice-delivery-197` for Issue #197 / PR #217.
Review mode: read-only contract, reproducibility, isolation, lifecycle, and runner-safety review.

## Findings

### [must-fix] Candidate snapshot identity was not recomputed

- Location: `src/benchmark/runner/pi/v2/staged/staged-practice-delivery.ts:282-293`.
- Rule: `AGENTS.md` requires immutable candidate/source identity and the runner contract requires the #196 snapshot binding; `docs/PI_RUNNER.md` treats snapshot verification as a preflight gate.
- Evidence: preflight only compared `private/snapshot.json.snapshot_id` with the plan and independently checked the two prompt hashes. A starter or private candidate file could therefore drift while the snapshot document still claimed the frozen id; the runner would copy that drifted starter into the Agent workspace.
- Impact: a successful attempt could run against a different candidate tree while retaining the frozen source/snapshot metadata, invalidating reproducibility and the single-variable delivery-node comparison.
- Required direction: recompute the frozen snapshot leaf map and snapshot id before session start, reject missing/extra/mismatched leaves, and reject symlinked candidate material.
- Disposition: fixed in `ebbdb01`; covered by the offline snapshot-drift test.

### [must-fix] Manual plan parser was looser than the declared strict schema

- Location: `src/benchmark/runner/pi/v2/staged/staged-practice-delivery.ts:200-249`.
- Rule: Issue #197 requires a strict versioned type/manifest; `schemas/staged-practice-delivery.schema.json` declares `additionalProperties: false` and integer budgets.
- Evidence: the parser silently ignored unknown fields, did not enforce the plan id pattern, and coerced `execution.budget.max_turns` / `max_duration_ms` through `Number()`, accepting strings and booleans that the schema rejects. This means the canonical hash could be computed over a silently normalized object rather than the supplied manifest.
- Impact: malformed or ambiguous plans could cross the contract boundary with an identity different from the operator-supplied manifest, weakening fail-closed behavior.
- Required direction: reject unknown keys and enforce the same type/pattern constraints as the JSON schema before canonical hashing.
- Disposition: fixed in `ebbdb01`; covered by strict parser contract tests.

### [should-fix] Runtime policy fields are metadata-only in this delivery adapter

- Locations: `src/benchmark/runner/pi/v2/staged/staged-practice-delivery.ts:44-47`, `src/benchmark/runner/pi/v2/staged/staged-practice-delivery-cli.ts:25-34`.
- Rule: the plan must bind model, prompt, budget, tool policy, and environment; repository Pi v2 preflight normally cross-checks these values against manifests.
- Evidence: the CLI passes `execution.model` and `max_duration_ms`, but hard-codes the tool list, does not enforce `max_turns`, does not verify `model_version` against Pi preflight output, and does not resolve or verify the environment manifest/policy hash. The plan hash therefore records these fields without proving that the runtime used them.
- Impact: a future operator could reuse a plan hash with a changed tool/environment/model-version runtime and still get a completed delivery trace, confounding the intended one-variable experiment.
- Direction: either add a dedicated runtime-policy preflight binding these fields to the adapter invocation/environment manifest, or explicitly defer this as a new versioned change before any formal run.
- Disposition: deferred from this offline delivery-only change; no formal/model run is permitted and the residual risk is recorded in the PR/Issue update.

## Verification performed

- `bun test src/benchmark/runner/pi/v2/staged/staged-practice-delivery.test.ts` — 15 pass after remediation.
- `bun test src/benchmark/runner/pi/v2/staged` — 32 pass.
- `bun test src/benchmark/treatments/pack-practice/v1` — 19 pass.
- `bun run test:contracts:runner` — 126 pass.
- `bun run validate` — pass (`Workspace layout is valid.`, `Snapshots are intact.`).
- `git diff --check` — pass.
- No model, Pi, Lore, network, or formal record was invoked.