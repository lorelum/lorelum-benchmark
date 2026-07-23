# Team directory RSC payload and client boundary

**Status:** candidate; offline-calibrated before any model invocation

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

The evaluator uses a fixed Flight request to inspect the initial route payload,
then browser tests to prove that sorting, filtering and selection do not
change. `server-serialization.md` is measured by the absence of server-only
notes; `server-dedup-props.md` is measured by the absence of a second derived
member-ID representation. These are deterministic payload probes, not timing
thresholds. Public issue wording does not prescribe a component boundary,
reference reuse or a React API.

## Public contract and offline admission

The public issue is [team-directory-rsc-payload.md](../public/issues/team-directory-rsc-payload.md).
Candidates may change only the team route and directory client. The app
manifest, lockfile, Next configuration, repository fixture and other routes
are protected. The reference, an independently written semantic control and
one mutation per rule must produce the same evaluator result in two consecutive
executions before this issue can become a pilot revision.

The two-run calibration produced `100/100` for the reference, `0/100` for the
semantic control, `50/100` for the server-note leak mutation and `50/100` for
the duplicate-prop mutation. All variants passed the public browser behavior;
the score differences therefore come only from the two fixed Flight probes.
