# Team directory RSC payload and client boundary

**Status:** pre-registered; implementation intentionally deferred

## Public sources

- https://github.com/vercel/next.js/issues/48677
- https://github.com/vercel/next.js/issues/95141

The member directory and evaluator will be independently authored. These
public reports supply a problem-family reference only and are not copied as a
task solution, public prompt or private oracle.

## Domain abstraction and fixed mapping

The server provides a member directory; the client owns filtering, sorting and
selection. The initial response currently transports redundant derived member
information and risks exposing server-only data. The only quality mappings are
`server-dedup-props.md` and `server-serialization.md`.

The evaluator will use a fixed client manifest to inspect Flight records,
duplicate references and server-only fields, then use browser tests to prove
that sorting, filtering and selection do not change. Public issue wording will
not prescribe moving code, reference reuse or a component boundary.
