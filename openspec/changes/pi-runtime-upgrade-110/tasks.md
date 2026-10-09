## 1. Baseline and OpenSpec gate

- [x] 1.1 Create Issue #238, record scope, non-goals, acceptance criteria, and size judgment (large).
- [x] 1.2 Verify latest `origin/main`, active environment manifests, Pi 1.1.0 package metadata, and CLI flags used by the runner against the 1.1.0 docs.
- [x] 1.3 Run `openspec validate pi-runtime-upgrade-110 --strict` and `bun run validate:openspec`.
- [x] 1.4 Create the initial PR (#239) containing only this change's OpenSpec artifacts and process metadata.

## 2. Plan confirmation

- [x] 2.1 Present scope, expected effects, verification method, and non-goals to the requester in Plan mode.
- [x] 2.2 Obtain explicit confirmation before any non-OpenSpec implementation; record the confirmation in Issue #238 and this change's design. Evidence: Issue #238 plan comment and `design.md` "Plan Confirmation Record". Requester reply was "继续" after the plan prompt was cancelled; recommended defaults applied (Node upgrade by operator, no real model call).

## 3. Runtime upgrade

- [x] 3.1 Update the `@earendil-works/pi-coding-agent` exact dependency to `1.1.0` in `package.json`, regenerate `bun.lock` (SHA-256 `b7f11323d5ee7505753ab40a9ceff49bac722b0aa19a4eaf38bee135ec4d2d24`), and verify `bun install --frozen-lockfile`.
- [x] 3.2 Update `Dockerfile.formal-pi` Pi assertion and `validate.yml` `PI_VERSION` to `1.1.0`; keep Node `24.21.0` and Bun `1.4.2` unchanged.
- [x] 3.3 Update `scripts/check-runtime.ts` expected Pi version, and point `sandbox-preflight.ts`, `local-sandbox-preflight.ts`, and `contract-app.test.ts` fixture at active versions (`formal-pi-deepseek-v4-pro/v3`, `local-wsl-pi/v4`).
- [x] 3.4 Add `environments/local-pi/v4`, `environments/local-wsl-pi/v4`, and `environments/formal-pi-deepseek-v4-pro/v3`. Formal v3 pins the digest published by workflow run 37872526780 (`sha256:4d0e64ec1927665a52617ad938ff6fb277a398b68cbc2c3671df16c4c5b98c7a`) from this branch. Existing environment versions are unchanged.
- [x] 3.5 Update `docs/FORMAL_SANDBOX.md`, `docs/PI_RUNNER.md`, `docs/FORMAL_SMOKE.md`, and `environments/README.md` to the new active versions.
- [x] 3.6 Update the `ci-runtime-modernization` runtime requirement through this change's spec delta.

## 4. Verification

- [x] 4.1 `./node_modules/.bin/pi --version` prints `1.1.0`; the image build asserts Bun `1.4.2`, Node `v24.21.0`, and Pi `1.1.0`.
- [ ] 4.2 `bun run check:runtime` fails on this workstation only because host Node is `v24.14.0` (requires machine-level upgrade to `v24.21.0`). `bun run check:runtime -- --manifest-only` passes.
- [x] 4.2a `bun run validate` and `bun run test:contracts:runner` pass. `bun run test:contracts:core` has 2 failures in `src/benchmark/judge/async-report-replan/v1/provider.test.ts`; the same 2 failures reproduce on `origin/main` in a clean worktree, caused by the local `.env` `LORELUM_JUDGE_REAL` opt-in, not this change.
- [x] 4.3 Runner CLI flags (`--print`, `--mode`, `--no-session`, `--no-tools`, `--no-context-files`, `--no-skills`, `--no-extensions`, `--no-prompt-templates`, `--append-system-prompt`, `--session-dir`, `--tools`) are present in `pi --help` of 1.1.0. This is a help-level check only; no model-backed smoke was run (not authorized).
- [x] 4.4 Formal image built and published on CI; in-image assertions for Bun/Node/Pi versions passed.
- [ ] 4.4a `bun run test:sandbox` requires the protected Linux formal runner (`LORELUM_SANDBOX_ENFORCED=1`, egress proxy, digest checks) and was not run on this workstation. `test:local-sandbox` was not run (requires `LORELUM_LOCAL_EXPERIMENT=1` and a local container).
- [x] 4.5 Lifecycle audit: `git diff --name-status main...HEAD -- environments incubator suites schemas policies experiments` shows only `environments/README.md` and three new manifest directories; no historical manifest, incubator, suite, schema, or record changed.
- [x] 4.5a `openspec validate --all --strict` (`bun run validate:openspec`) exits 0; no model call, no formal record, no suite promotion.
- [ ] 4.5b Public/private leakage audit: not run as a dedicated audit. The change adds no agent-visible files (see 4.5 diff), but no leakage scan was executed.

## 5. Handoff

- [ ] 5.1 Run the two-round independent read-only review required by `docs/PR_REVIEW.md`. Round 1 ran on `3130d19` (no must-fix; findings addressed in this commit). Round 2 pending on the final SHA.
- [ ] 5.2 Update Issue #238 and PR #239 with root cause, scope, validation evidence, residual uncertainty, and the environment migration rule.
- [ ] 5.3 Operator to upgrade the local workstation Node from `v24.14.0` to `v24.21.0` (machine operation outside this PR), then rerun `bun run check:runtime`.
