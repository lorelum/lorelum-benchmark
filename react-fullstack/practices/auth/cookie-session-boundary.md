---
id: react.auth.cookie-session-boundary
title: Cookie-Backed Browser Session Boundary
title_zh: 基于 Cookie 的浏览器会话边界
domain: auth
stage: [architecture, api-layer, feature-implementation]
tech_stack: [react, typescript]
applies_when: building a React SPA that controls its browser-facing API and needs a durable signed-in session without exposing a reusable credential to page JavaScript
applies_when_zh: 构建可控制浏览器 API 的 React SPA，且需要持久登录会话并避免让页面 JavaScript 读取可复用凭据时
status: draft
related:
  - auth.token-in-web-storage
  - auth.cookie-session-without-csrf
  - react.auth.single-flight-token-refresh
  - react.auth.route-guard-boundaries
tags: [session, cookie, csrf, bootstrap, authentication]
last_reviewed: 2026-07-16
---

# Cookie-Backed Browser Session Boundary

## When to apply

Use this when the same product controls the React SPA and the API that
authenticates it. The browser must keep a login across reloads, but ordinary
page JavaScript does not need to read or forward a reusable bearer credential.

Do not apply it unchanged to a third-party API that requires a bearer token, a
native client, or a cross-site embedding topology. Those constraints need a
separate session design; do not weaken cookie flags merely to make this pattern
fit.

## Core guidance

### Make the browser session a server concern

On successful sign-in, have the API set an `HttpOnly`, `Secure` session cookie
with the narrowest workable `Path`, `Domain`, `Max-Age`, and `SameSite`
attributes. The API owns creation, rotation, expiry, and revocation. The React
app learns only the **current session projection** it needs for UI decisions,
such as user id, display name, and permissions.

That boundary prevents UI code, analytics scripts, and an accidental debug log
from handling a durable credential. It does not make XSS harmless: keep normal
XSS defences, dependency review, and output encoding in place.

### Bootstrap from an explicit session endpoint

Fetch a narrow `GET /api/session` resource when the application starts. It
returns either a safe session projection or an unauthenticated response; it
does not return the cookie value. Make cookie inclusion explicit so the
behaviour is visible in the client contract.

```ts
// features/auth/api/sessionApi.ts
export interface SessionUser {
  id: string;
  displayName: string;
  permissions: string[];
}

export interface Session {
  user: SessionUser;
}

export async function getSession(signal?: AbortSignal): Promise<Session | null> {
  const response = await fetch('/api/session', {
    credentials: 'include',
    signal,
  });

  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Session lookup failed: ${response.status}`);

  return (await response.json()) as Session;
}
```

Treat this query as server state rather than copying the session into mutable
component state. A server-cache library gives route guards and feature code one
consistent answer about whether bootstrap has completed.

```tsx
// features/auth/api/useSession.ts
import { useQuery } from '@tanstack/react-query';
import { getSession } from './sessionApi';

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: ({ signal }) => getSession(signal),
    staleTime: 60_000,
    retry: false,
  });
}
```

### Pair cookies with a deliberate CSRF defence

Cookie authentication means the browser can attach a cookie without JavaScript
reading it. For state-changing requests, the server must enforce a CSRF policy
appropriate to the deployment: for example, strict Origin/Referer validation,
or a server-verified CSRF token. The client should send the required token only
through the shared request boundary, never ad hoc from individual components.

```ts
// lib/api/request.ts
export async function sendMutation(
  input: RequestInfo | URL,
  init: RequestInit,
  csrfToken: string,
): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: 'include',
    headers: {
      ...init.headers,
      'X-CSRF-Token': csrfToken,
    },
  });
}
```

The backend remains the authority: verify the CSRF signal, authenticate the
cookie, and authorize the requested operation. A frontend guard is only UX.

## Tradeoffs

- **Cross-site SPA/API deployments:** cookie attributes, CORS, and CSRF policy
  must be designed together. `Access-Control-Allow-Origin: *` cannot be used
  with credentialed requests. Prefer a same-site topology or a deliberate BFF
  instead of casually enabling cross-origin credentials.
- **Short-lived access token architecture:** keeping a short-lived access token
  only in memory can be valid when an HttpOnly refresh cookie exists. In that
  design, use `react.auth.single-flight-token-refresh`; never fall back to
  durable Web Storage for convenience.
- **Non-browser clients:** this is not a universal token-storage rule. Mobile,
  CLI, and service clients need platform-specific secure credential storage.

## Anti-patterns

- **auth.token-in-web-storage** — do not persist a durable browser credential
  in `localStorage` or `sessionStorage`.
- **auth.cookie-session-without-csrf** — do not make cookie-authenticated
  mutations without server-enforced CSRF protection.
