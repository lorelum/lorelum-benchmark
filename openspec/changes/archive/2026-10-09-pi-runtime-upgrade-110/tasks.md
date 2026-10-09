## 1. Baseline and OpenSpec gate

- [x] 1.1 Create Issue #238, record scope, non-goals, acceptance criteria, and size judgment (large).
- [x] 1.2 Verify latest `origin/main`, active environment manifests, Pi 1.1.0 package metadata, and CLI flags used by the runner against the 1.1.0 docs.
- [x] 1.3 Run `openspec validate pi-runtime-upgrade-110 --strict` and `bun run validate:openspec`.
- [x] 1.4 Create the initial PR (#239) containing only this change's OpenSpec artifacts and process metadata.

## 2. Plan confirmation

- [x] 2.1 Present scope, expected effects, verification method, and non-goals to the requester in Plan mode.
- [x] 2.2 Obtain explicit confirmation before any non-OpenSpec implementation; record the confirmation in Issue #238 and this change's design. Evidence: Issue #238 plan comment and `design.md` "Plan Confirmation Record". Requester replied "继续" after the plan prompt was cancelled; recommended defaults applied (Node upgrade by operator, no real model call).

## 3. Runtime upgrade

- [x] 3.1 Update the `@earendil-works/pi-coding-agent` exact dependency to `1.1.0` in `package.json` and regenerate `bun.lock` (SHA-256 `b7f11323d5ee7505753ab40a9ceff49bac722b0aa19a4eaf38bee135ec4d2d24`); `bun install --frozen-lockfile` passes.
- [x] 3.2 Update `Dockerfile.formal-pi` Pi assertion and `validate.yml` `PI_VERSION` to `1.1.0`; keep Node `24.21.0` and Bun `1.4.2` unchanged.
- [x] 3.3 Update `scripts/check-runtime.ts` expected Pi version and add the lockfile hash check; point `sandbox-preflight.ts`, `local-sandbox-preflight.ts`, and the `contract-app.test.ts` fixture at active versions (`formal-pi-deepseek-v4-pro/v3`, `local-wsl-pi/v4`).
- [x] 3.4 Add `environments/local-pi/v4`, `environments/local-wsl-pi/v4`, and `environments/formal-pi-deepseek-v4-pro/v3`. Formal v3 pins the digest published by workflow run 37872526780 (`sha256:4d0e64ec1927665a52617ad938ff6fb277a398b68cbc2c3671df16c4c5b98c7a`). Existing environment versions are unchanged.
- [x] 3.5 Update `docs/FORMAL_SANDBOX.md`, `docs/PI_RUNNER.md`, `docs/FORMAL_SMOKE.md`, and `environments/README.md` to the new active versions.
- [x] 3.6 Update the `ci-runtime-modernization` runtime requirement through this change's spec delta.

## 4. Verification

- [x] 4.1 `pi --version` (project binary) prints `1.1.0`; the formal image build asserts Bun `1.4.2`, Node `v24.21.0`, and Pi `1.1.0`.
- [x] 4.2 `bun run check:runtime` passes on the host after the operator upgraded Node to `v24.21.0` (screenshot evidence in session: `node --version` = `v24.21.0`, output "Runtime manifests are consistent and host versions match.").
- [x] 4.2a `bun run validate` and `bun run test:contracts:runner` pass. `bun run test:contracts:core` has 2 failures in `src/benchmark/judge/async-report-replan/v1/provider.test.ts`; the same failures reproduce on `origin/main`, caused by the local `.env` `LORELUM_JUDGE_REAL` opt-in. Not caused by this change; left unresolved.
- [x] 4.3 Runner CLI flags are present in `pi --help` of 1.1.0. This is a help-level check only; no model-backed smoke was run (DeepSeek balance insufficient; not authorized).
- [x] 4.4 Formal image built and published by CI (run 37872526780); in-image assertions for Bun/Node/Pi versions passed.
- [ ] 4.4a `bun run test:sandbox` was NOT run. It requires the protected Linux formal runner (`LORELUM_SANDBOX_ENFORCED=1`, egress network and proxy). Accepted risk by the requester on merge; no protected runner available. Local WSL/Docker functional check was not executed.
- [x] 4.5 Lifecycle audit: `git diff --name-status main...HEAD -- environments incubator suites schemas policies experiments` shows only `environments/README.md` and three new manifest directories; no historical manifest, incubator, suite, schema, or record changed.
- [x] 4.5a `openspec validate --all --strict` (`bun run validate:openspec`) exits 0; no model call, no formal record, no suite promotion.
- [ ] 4.5b Public/private leakage audit was NOT run as a dedicated audit. The change adds no agent-visible files (see 4.5). Accepted as a known gap by the requester.

## 5. Handoff

- [x] 5.1 Two-round independent read-only review per `docs/PR_REVIEW.md`. Round 1 on `3130d19`: no must-fix; process findings addressed in `716cd8b`. Round 2 on `716cd8b`: no blocking items; lockfile hash check and digest note added in `0508dde`.
- [x] 5.2 Issue #238 and PR #239 updated with scope, validation evidence, residual uncertainty, and the environment migration rule.
- [x] 5.3 Local workstation Node upgraded to `v24.21.0` by the operator (machine operation, outside the PR diff).
