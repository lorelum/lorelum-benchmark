# Workspace dashboard RSC reads and dependency graph

**Status:** pre-registered, first implementation target

## Public sources

- https://github.com/vercel/next.js/issues/62961
- https://github.com/vercel/next.js/issues/58723

These incidents motivate the broad category only. The Atlas domain, seeded
data, public issue, source layout, probes and reference were independently
written. No source patch, test, reproduction or solution has been copied.

## Domain abstraction

A member opens a workspace dashboard. The overview, quota and recent projects
are separate repository operations. The visible output and error behavior must
not change, but repeated normalized workspace reads and unnecessary dependency
ordering currently make the request's server work larger than necessary.

## Fixed rule attribution

| behavior id | rule behavior | delivered rule |
| --- | --- | --- |
| `request-scope-workspace-dedup` | Equal normalized workspace reads share one request-local read | `server-cache-react.md` |
| `independent-root-start` | Quota work starts with the workspace root | `async-parallel.md` |
| `projects-after-workspace` | Projects start only after workspace resolution, not after unrelated quota work | `async-dependencies.md` |

## Public contract

The public issue is [workspace-dashboard-rsc.md](../public/issues/workspace-dashboard-rsc.md).
It intentionally names no React API, cache, parallel primitive or solution.
The candidate may change only `lib/dashboard-runtime.ts` and the dashboard
server components. `package.json`, `bun.lock`, Next configuration, test
configuration, repository fixtures and auth policy are protected.

## Offline admission

The reference, naive implementation and each mutation must each produce the
same result in two consecutive evaluator executions. Public functional tests
are hard gates. Only then can this dossier become a pilot task revision.
