## 1. Baseline and OpenSpec gate

- [x] 1.1 Create Issue #238, record scope, non-goals, acceptance criteria, and size judgment (large).
- [x] 1.2 Verify latest `origin/main`, active environment manifests, Pi 1.1.0 package metadata, and CLI flags used by the runner against the 1.1.0 docs.
- [ ] 1.3 Run `openspec validate pi-runtime-upgrade-110 --strict` and `bun run validate:openspec`.
- [ ] 1.4 Create the initial PR containing only this change's OpenSpec artifacts and process metadata, then present the plan for confirmation.

## 2. Plan confirmation (blocking)

- [ ] 2.1 Present scope, expected effects, verification method, and non-goals to the requester in Plan mode.
- [ ] 2.2 Obtain explicit confirmation before any non-OpenSpec implementation; record the confirmation in Issue #238 and this change's design.

## 3. Runtime upgrade

- [ ] 3.1 Update the `@earendil-works/pi-coding-agent` exact dependency to `1.1.0` in `package.json` and regenerate `bun.lock`; verify `bun install --frozen-lockfile`.
- [ ] 3.2 Update `Dockerfile.formal-pi` Pi assertion and `validate.yml` `PI_VERSION` to `1.1.0`; keep Node `24.21.0` and Bun `1.4.2` unchanged.
- [ ] 3.3 Update `scripts/check-runtime.ts` expected Pi version and any runner tests that assert the active Pi version.
- [ ] 3.4 Add `environments/formal-pi-deepseek-v4-pro/v3`, `environments/local-pi/v4`, and `environments/local-wsl-pi/v4` with Pi `1.1.0` and the new `lockfile_sha256`; leave all existing environment versions unchanged.
- [ ] 3.5 Update `docs/FORMAL_SANDBOX.md`, `docs/PI_RUNNER.md`, and `environments/README.md` to name the new active versions.
- [ ] 3.6 Update the stable `ci-runtime-modernization` requirement through this change's spec delta, and keep its scenarios consistent.

## 4. Verification

- [ ] 4.1 Confirm `pi --version` prints `1.1.0`, `node --version` prints `v24.21.0`, and `bun --version` prints `1.4.2`.
- [ ] 4.2 Run `bun run check:runtime`, `bun run validate`, `bun run test:contracts:core`, and `bun run test:contracts:runner`.
- [ ] 4.3 Run an offline Pi CLI smoke for the flags the runner uses (`--help` or parse-only); if a model-backed smoke is needed, obtain explicit authorization first.
- [ ] 4.4 Build `Dockerfile.formal-pi`, verify in-image Bun/Node/Pi versions, and run `bun run test:sandbox` and `bun run test:local-sandbox`.
- [ ] 4.5 Run `openspec validate --all --strict --json`, public/private leakage audit, and lifecycle audit; confirm no model call, formal record, suite promotion, or historical environment rewrite.

## 5. Handoff

- [ ] 5.1 Run the two-round independent read-only review required by `docs/PR_REVIEW.md` for the contract-touching PR.
- [ ] 5.2 Update Issue #238 and the PR with root cause, scope, validation evidence, residual uncertainty, and the environment migration rule.
- [ ] 5.3 Note that local workstation Node upgrade to `v24.21.0` is a machine operation outside the PR.
