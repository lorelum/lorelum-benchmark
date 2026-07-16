---
id: react.auth.single-flight-token-refresh
title: Single-Flight Token Refresh
title_zh: 单飞令牌刷新
domain: auth
stage: [api-layer, feature-implementation, review]
tech_stack: [react, typescript]
applies_when: a React SPA uses short-lived in-memory access tokens with a refresh endpoint and several protected requests can receive 401 responses concurrently
applies_when_zh: React SPA 使用短期内存 access token 和刷新端点，且多个受保护请求可能同时收到 401 时
status: draft
related:
  - auth.parallel-refresh
  - auth.retry-401-forever
  - auth.refresh-in-component
  - react.auth.cookie-session-boundary
tags: [authentication, access-token, refresh-token, concurrency, http]
last_reviewed: 2026-07-16
---

# Single-Flight Token Refresh

## When to apply

Use this only when the application deliberately keeps a short-lived access
token in memory and refreshes it through a server endpoint, commonly using an
HttpOnly refresh cookie. It applies at the shared transport boundary, where a
single expiry can make many parallel requests return `401`.

Do not add this mechanism to a pure cookie-session design whose API never
returns an access token. Do not use it to retry `403`: that response normally
means the authenticated user lacks permission, not that their credential needs
refreshing.

## Core guidance

### One coordinator owns refresh state

Keep the access token in a minimal in-memory store. A module-scoped promise
coalesces all refresh attempts that begin while a refresh is already in flight.
Every waiter receives the same new token or the same failure; the promise is
cleared in `finally` so a future session can attempt a new refresh.

```ts
// features/auth/api/tokenCoordinator.ts
type RefreshPayload = { accessToken: string };

interface TokenStore {
  getAccessToken(): string | null;
  setAccessToken(token: string): void;
  clear(): void;
}

let accessToken: string | null = null;

export const tokenStore: TokenStore = {
  getAccessToken() {
    return accessToken;
  },
  setAccessToken(token) {
    accessToken = token;
  },
  clear() {
    accessToken = null;
  },
};

let refreshInFlight: Promise<string> | null = null;

export function refreshAccessToken(): Promise<string> {
  if (!refreshInFlight) {
    refreshInFlight = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Session refresh failed');
        return (await response.json()) as RefreshPayload;
      })
      .then(({ accessToken }) => {
        tokenStore.setAccessToken(accessToken);
        return accessToken;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}
```

### Retry the original protected request exactly once

The protected-request helper adds the current token, attempts the request, and
refreshes only after a `401`. It then retries the original request one time
with the newly issued token. A second `401` ends the session locally and lets
the caller route the user to sign-in; it must not recurse.

```ts
// lib/api/protectedRequest.ts
import { refreshAccessToken, tokenStore } from '@/features/auth/api/tokenCoordinator';

export class SessionExpiredError extends Error {}

function withAuthorization(init: RequestInit, token: string | null): RequestInit {
  return {
    ...init,
    credentials: 'include',
    headers: {
      ...init.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

export async function protectedRequest(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const first = await fetch(input, withAuthorization(init, tokenStore.getAccessToken()));
  if (first.status !== 401) return first;

  let refreshedToken: string;
  try {
    refreshedToken = await refreshAccessToken();
  } catch {
    tokenStore.clear();
    throw new SessionExpiredError('Sign in again to continue');
  }

  const retry = await fetch(input, withAuthorization(init, refreshedToken));
  if (retry.status === 401) {
    tokenStore.clear();
    throw new SessionExpiredError('Sign in again to continue');
  }

  return retry;
}
```

Call this helper from API modules, not from components. The API module still
decides resource paths and maps DTOs; the coordinator only owns token lifecycle
and retry coordination.

### Test concurrency and terminal failure

The critical test is not just one expired request. Start two or more protected
requests, make them all receive `401`, and assert that the refresh endpoint is
called once and each request retries with the returned token. Separately assert
that a failed refresh clears state and that a retry which still receives `401`
does not start another refresh.

## Tradeoffs

- **Request bodies:** a streamed request body cannot be sent twice. For uploads
  or one-shot streams, use an API-specific retry strategy rather than blindly
  passing it through this helper.
- **Unsafe mutations:** a retry can duplicate work if the server performed the
  mutation before responding `401`. Use server-supported idempotency keys for
  operations where a duplicate charge, order, or write is unacceptable.
- **Refresh endpoint policy:** the server should rotate or revoke refresh
  credentials according to its own security policy. The client coordinator
  cannot compensate for weak server-side rotation or revocation.

## Anti-patterns

- **auth.parallel-refresh** — concurrent `401` responses must share one
  in-flight refresh operation.
- **auth.retry-401-forever** — retry the protected request once after refresh,
  then end the session path.
- **auth.refresh-in-component** — keep refresh coordination in the shared
  transport layer, not in page or component logic.
