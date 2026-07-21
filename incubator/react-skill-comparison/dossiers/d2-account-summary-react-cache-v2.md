# D2 — account summary React cache v2

**Status:** public routing coverage passed
**Proposed task:** `account-summary-react-cache/v2`
**Relevance target:** direct

## Public product contract

Render several server account panels during one workspace render. Equal trimmed
account identifiers must observe one account and permission read in that render.
A later workspace render must start new reads. Blank identifiers return `null`;
a missing account never reads permissions; repository errors retain identity.

The task may expose the pinned React server runtime as an existing dependency,
but does not name an implementation helper or a Skill rule.

## Offline quality design

- The real pinned React server renderer drives equal primitive account IDs in
  one render, then an independent second render.
- Repository counters measure account deduplication, permission deduplication,
  and render-scope separation without wall-clock thresholds.
- Mutations: no deduplication, cross-render module cache, unstable object-key
  inputs, and permission read after a missing account.

## Admission gate

Before a formal task revision, route a temporary public draft with the pinned
bundle. Require complete rule coverage, confirmed React runtime behavior,
reference pass twice, starter failure, and three rejected mutations.

## Routing result

On 2026-07-21, `public-bm25/v1` selected `server-cache-react.md` within its
three-rule context from this draft's public materials. It may proceed to the
pinned-runtime reference and evaluator gate.
