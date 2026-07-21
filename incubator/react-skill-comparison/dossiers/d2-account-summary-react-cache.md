# D2 — account summary React cache

**Status:** design only  
**Proposed task:** `account-summary-react-cache/v1`  
**Skill relevance:** direct  
**Pre-registered rule:** `server-cache-react.md`

## Admission sources

- [SWR #3013](https://github.com/vercel/swr/issues/3013), rechecked
  2026-07-21: two mounted consumers of an equal key can cause duplicate
  requests when the invalidation/deduplication boundary is wrong.
- [SWR #4282](https://github.com/vercel/swr/pull/4282), rechecked
  2026-07-21: a deduplicated revalidation path must avoid creating separate
  promises for equivalent work.

The task is an original server-rendered account workspace. Its public prompt
and private evaluator must not copy SWR APIs, source code, instrumentation, or
patch wording.

## Runtime gate

This candidate is not admissible until the repository contains a pinned React
and React DOM server runtime plus its reconstructable lockfile. The reference
and evaluator must use the real `React.cache()` implementation in a confirmed
server-render path. A closure `Map`, a replacement cache shim, or a simulated
request context rejects this dossier rather than approximating the rule.

Before task implementation, the chosen runtime must demonstrate offline that:

- equal primitive arguments deduplicate during one server render;
- a later independent server render starts a fresh cache scope; and
- its rejection behavior is understood and explicitly captured by evaluator
  assertions.

## Runtime verification record

Verified on 2026-07-21 with exact `react`, `react-dom`, and
`react-server-dom-webpack` version `19.2.3`, the repository lockfile, and:

```text
bun run test:react-runtime
```

The probe invokes the real React Server Components renderer under the
`react-server` condition. It establishes one read for equal primitive arguments
in one render, a fresh read in a second render, original rejection identity at
the renderer boundary, and a successful later-render retry. `react-dom/server`
is explicitly not an admissible substitute: its SSR/Suspense retries did not
provide this request-scope `cache()` contract.

## Product framing

Render an account workspace with several server panels. The panels independently
request an account summary and its permissions for the same normalized account
identifier during one render. A later render of the same workspace must make
its own repository reads. A blank identifier returns `null`; a missing account
does not request permissions.

The public task describes server panels, repository interfaces, and observable
product behavior only. It must not name `React.cache`, a cache API, a rule, or
an implementation strategy. The runtime setup may expose React as an existing
dependency because the behavior is specifically a React server contract.

## Semantic hard gates

- Blank identifiers return `null` without an account or permissions read.
- The output maps account and permissions data to the declared public summary
  shape.
- A missing account returns `null` and does not read permissions.
- A repository rejection preserves the original error object according to the
  verified server-render semantics.
- A later independent render does not reuse data or errors from the first
  render.

## Deterministic quality probes

The evaluator renders a fixed server component tree twice with a controllable
repository. It uses call/resource counters, never elapsed-time thresholds. Only
after semantic success, it awards:

| Probe | Score | Required observation |
| --- | ---: | --- |
| Account deduplication | 40 | Repeated equal primitive IDs within the first render issue one account read. |
| Permissions deduplication | 30 | The same panels issue one permissions read after the shared account resolves. |
| Render-scope separation | 20 | The second render issues a fresh account and permissions pair. |
| Argument discipline | 10 | Equivalent normalized primitive IDs hit the same first-render work; fresh object wrappers do not define the contract. |

Any semantic failure has score `0` and no quality probes. A semantic pass must
emit the named probes and score through `evaluator_contract: structured/v2`.

## Required mutation resistance

Offline calibration must reject:

- no deduplication;
- a module-global cache that leaks across two server renders;
- a cache keyed by a fresh object wrapper for each same-ID panel; and
- an implementation that swallows or replaces the repository error, or reads
  permissions for a missing account.

## Implementation prerequisites

- This is a replacement slug, not a rewrite of
  `account-summary-request-cache/v1`; preserve that task and its history.
- Pin the exact React / React DOM server versions before adding any task files,
  then record their manifest and lockfile hashes in the future environment and
  task materials.
- Create the reference against the real runtime first and prove the three
  runtime-gate observations before writing starter, evaluator, or snapshot.
- Complete reference, starter, three mutation candidates, regenerated snapshot,
  and twice-repeated offline calibration before admission as a `pilot` task.
