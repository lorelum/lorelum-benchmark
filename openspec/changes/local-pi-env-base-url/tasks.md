## 1. Local Catalog Override

- [ ] 1.1 Add a helper that resolves `LORELUM_PI_BASE_URL` or `LORELUM_JUDGE_BASE_URL`.
- [ ] 1.2 Create an isolated temporary DeepSeek model catalog with the resolved base URL.
- [ ] 1.3 Wire the temporary `PI_CODING_AGENT_DIR` into the local profile diagnostic runner with cleanup.

## 2. Validation

- [ ] 2.1 Add tests for explicit override, judge fallback, no-override behavior, and cleanup.
- [ ] 2.2 Run profile runner preflight against the local configured endpoint.
- [ ] 2.3 Run `bun run validate`, OpenSpec strict, and `git diff --check`.
