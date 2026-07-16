# Task: make protected requests recover from an expired credential

You are working on an existing React + TypeScript SPA. Its UI uses a short-lived
access token kept in memory; the server owns session renewal. Background data
loads often begin together, and users are intermittently signed out when their
credential expires.

Complete the TODO implementation in `src/auth/protectedRequest.ts`. Keep the
public types and exports in `src/auth/contracts.ts` unchanged. You may add
small, focused helpers under `src/auth/`, but do not add dependencies or edit
`package.json`.

Product expectations:

- A valid signed-in user should continue after recoverable credential expiry,
  even when several protected requests begin together.
- When the session cannot be recovered, all callers should reach one clear,
  deterministic signed-out outcome rather than remain pending or retry forever.
- The browser application must not persist its reusable access credential in
  Web Storage.

Run the checks available in the workspace. Do not change test configuration or
add test-only branches. At completion, list your changed files, commands run,
and assumptions.
