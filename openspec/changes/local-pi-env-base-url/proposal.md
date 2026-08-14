## Why

Local Pi diagnostics currently hardcode the DeepSeek catalog's `https://api.deepseek.com` base URL. This repository's `.env` can point the same model to a different API request address, but the runner ignores it, causing local model preflight to fail with 401 even though the configured endpoint works.

## What Changes

- Add a local-only Pi model catalog override that uses `LORELUM_PI_BASE_URL` first and falls back to `LORELUM_JUDGE_BASE_URL`.
- Generate an isolated temporary `PI_CODING_AGENT_DIR` with a DeepSeek model catalog, without modifying the user's global Pi configuration.
- Keep the formal `pi/v2` runner, formal environment, proxy, and record contracts unchanged.

## Capabilities

### New Capabilities

- `local-pi-model-routing`: defines how local profile diagnostics select the model API request address and isolate temporary Pi catalog overrides.

### Modified Capabilities

## Impact

- `src/benchmark/runner/pi/v2/profile-diagnostic-runner.ts`
- Local profile diagnostic preflight tests
- No change to formal runner, sandbox, environment, candidate, suite, treatment, or record behavior.
