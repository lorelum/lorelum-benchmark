---
id: react.auth.route-guard-boundaries
title: Route Guards Are UX, Server Authorization Is Security
title_zh: 路由守卫负责体验，服务端授权负责安全
domain: auth
stage: [routing, feature-implementation, review]
tech_stack: [react, typescript, react-router]
applies_when: adding authenticated or permission-sensitive routes to a React SPA that bootstraps session state asynchronously
applies_when_zh: 为异步加载会话状态的 React SPA 新增需要登录或权限敏感的路由时
status: draft
related:
  - auth.client-only-authorization
  - routing.redirect-before-session-resolves
  - routing.untrusted-return-url
  - react.auth.cookie-session-boundary
tags: [routing, authorization, session, react-router, redirect]
last_reviewed: 2026-07-16
---

# Route Guards Are UX, Server Authorization Is Security

## When to apply

Use this when a route should be hidden from anonymous users or should require a
known UI permission. The session is fetched asynchronously, so the guard must
distinguish **loading**, **anonymous**, **authenticated but forbidden**, and
**session lookup failure**.

Do not treat this Practice as a way to secure data or mutations. Every API
endpoint must independently authenticate the request and authorize the action,
even if no React route renders a control for it.

## Core guidance

### Resolve the session before making a redirect decision

An unknown session is not proof that the user is anonymous. Render a loading
state while bootstrap is pending; retry or surface a meaningful failure if the
session lookup fails. Redirect only after the query returns an explicit `null`.

```tsx
// features/auth/components/RequireAuthenticated.tsx
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSession } from '../api/useSession';

function FullPageLoading() {
  return <p aria-busy="true">Checking your session…</p>;
}

export function RequireAuthenticated({ children }: { children: ReactNode }) {
  const session = useSession();
  const location = useLocation();

  if (session.isLoading) return <FullPageLoading />;
  if (session.isError) {
    return <p role="alert">We could not verify your session. Please try again.</p>;
  }

  if (!session.data) {
    const internalLocation = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/sign-in" replace state={{ from: internalLocation }} />;
  }

  return <>{children}</>;
}
```

The saved destination comes from the router's current location, not from a
query parameter supplied by another site. After sign-in, accept it only if it
is an internal path.

```ts
// features/auth/navigation/returnPath.ts
export function safeReturnPath(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}
```

### Separate authentication from permission-aware UX

Authentication answers whether the user has a session. A permission guard may
improve navigation and avoid presenting an action that will fail, but it must
render a clear forbidden state rather than redirecting a signed-in user to
login. The API remains responsible for the final `403` decision.

```tsx
// features/auth/components/RequirePermission.tsx
import type { ReactNode } from 'react';
import { useSession } from '../api/useSession';

export function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const session = useSession();

  if (session.isLoading) return <p aria-busy="true">Loading permissions…</p>;
  if (session.isError || !session.data) return <p role="alert">Unable to load access.</p>;
  if (!session.data.user.permissions.includes(permission)) {
    return <p role="alert">You do not have access to this page.</p>;
  }

  return <>{children}</>;
}
```

Use the same, cached session query for both guards. Do not create per-route
`fetch('/api/session')` calls; they make navigation racey and can yield
contradictory answers during logout.

### Invalidate session state at lifecycle boundaries

After sign-in, sign-out, or a terminal refresh failure, update or invalidate
the single `['session']` query key. This gives every guard the new answer on
its next render and prevents stale permissions from leaving UI visible.

```ts
// features/auth/api/sessionLifecycle.ts
import type { QueryClient } from '@tanstack/react-query';

export async function finishSignOut(queryClient: QueryClient): Promise<void> {
  await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
  queryClient.setQueryData(['session'], null);
}
```

## Tradeoffs

- **Data Router loaders:** React Router loaders can redirect before rendering
  and are often preferable for route trees already built around them. Preserve
  the same four-state model and avoid duplicating session fetching in both a
  loader and a component guard.
- **Optimistic UI:** hiding an action based on cached permissions improves UX,
  but permission changes can happen elsewhere. Always handle a server `403`
  from the mutation path and refresh session data when appropriate.
- **Public routes with optional sessions:** do not wrap the whole application.
  Keep public pages public and allow them to render from an optional session
  query; use `RequireAuthenticated` only where authentication is required.

## Anti-patterns

- **auth.client-only-authorization** — route guards are not the server's
  authorization layer.
- **routing.redirect-before-session-resolves** — wait for a resolved session
  before declaring the user anonymous.
- **routing.untrusted-return-url** — never redirect to an arbitrary external
  value after sign-in.
