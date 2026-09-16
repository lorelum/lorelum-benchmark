## Context

The local profile diagnostic runner invokes Pi with the global model catalog from `PI_CODING_AGENT_DIR`. That catalog records DeepSeek's public `baseUrl`. The repository `.env` already documents an internal model request address, but no runner code maps it into Pi's catalog.

## Goals / Non-Goals

**Goals:**

- Make local diagnostics use the `.env` model request address automatically.
- Keep the user's global Pi catalog unchanged.
- Keep the formal runner and formal environment unchanged.

**Non-Goals:**

- Do not add a new provider or model.
- Do not cache secrets in the repository.
- Do not alter candidate identity or model-tier declarations.

## Decisions

- Read `LORELUM_PI_BASE_URL` first, then `LORELUM_JUDGE_BASE_URL`. This gives local diagnostics an explicit override while preserving the existing judge endpoint as fallback.
- Clone the user's existing `models-store.json` into a temporary `PI_CODING_AGENT_DIR`, then replace DeepSeek `baseUrl` values. Cloning preserves model cost/compatibility fields and avoids a hardcoded second catalog.
- Set the temporary directory only for the local profile diagnostic process. Child Pi processes inherit it, while the formal `pi/v2` runner does not.
- When neither env var is present, keep the existing behavior.

## Risks / Trade-offs

- [A malformed internal URL could break local preflight] → Validate the URL before writing the temporary catalog and fail closed with a clear error.
- [The temporary catalog could leak into a long-running process] → Create it under the OS temp directory and remove it when the local diagnostic finishes.
- [The behavior could be confused with formal model routing] → Name the capability local-only and add tests asserting formal runner behavior is untouched.
