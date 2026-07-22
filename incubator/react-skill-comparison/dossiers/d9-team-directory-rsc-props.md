# D9 - team directory RSC props

**Status:** candidate design only
**Proposed task:** `team-directory-rsc-props/v1`
**Relevance target:** direct
**Candidate rule:** `server-dedup-props.md`

## Admission Sources

- [Next.js #74343](https://github.com/vercel/next.js/issues/74343): client
  boundary serialization constraints in a production App Router application.
- [Next.js #55332](https://github.com/vercel/next.js/issues/55332): a second
  public report about the same Server/Client prop boundary class.

These reports establish the external setting only. The task will use an
original team-directory domain, interface, evaluator and fixtures. It must not
copy a source patch, reproduction, API surface or solution wording.

## Why This Candidate

D3 was retired because its selected rule did not imply the evaluator's
row-cache requirement. D9 instead targets the exact behavior described by
`server-dedup-props.md`: RSC serialization preserves duplicate object data only
when the same reference crosses the client boundary, and server-side derived
arrays duplicate primitive payload.

The pinned React `19.2.3` RSC runtime has already passed a no-error capability
probe with a registered client reference and manifest: passing one shared
100-member array produced a 1473-byte Flight payload, while passing a copied
array produced 2646 bytes. This is a deterministic, actual-runtime signal;
it is not a wall-clock proxy.

## Product Framing

A server team-directory entry prepares props for one interactive client
directory. The client can show the original member order, an alphabetical
view, active-member counts and a selected member without a second server copy
of the member list. The public task will define the observable directory
states, selected-member fallback and invalid-member behavior, but will not
name RSC, serialization, reference identity, a rule, or a derived-array API.

The starter will expose a server entry and an existing client presentation
boundary. The candidate may change only the server entry. The client boundary
will already support a canonical member sequence plus small view-state props,
so no private requirement asks the candidate to invent an unavailable API.

## Planned Private Evaluator

### Semantic Hard Gates

- The initial, alphabetical and active-only views show the same member IDs in
  their declared order and preserve a valid selected member.
- An unknown selected ID falls back to the declared empty selection without
  mutating the input member array or records.
- Empty teams and a view whose filter has no members remain valid and produce
  no phantom selection.
- The server entry returns a client-boundary element accepted by the pinned RSC
  manifest without an error frame.

### Deterministic Quality Score

Only after all semantic gates pass, render a large primitive-heavy member
fixture through `react-server-dom-webpack` with the fixed client manifest:

| Probe | Points | Observable |
| --- | ---: | --- |
| canonical member reference | 45 | the raw member sequence is serialized once across client needs |
| no server-side derived duplicate | 35 | alphabetical and active views add only small state, not a copied member array |
| boundary field minimization | 20 | server-only metadata does not cross the client boundary |

The evaluator compares Flight bytes and reference records across repeated
renders of fixed data. It forbids error frames and normalizes the fixed module
identifier; it does not use timing or hidden rule names.

## Required Mutation Resistance

- pass `members.toSorted()` beside the original member sequence;
- pass a filtered or mapped duplicate member array for the active view;
- clone each member to build a client convenience shape;
- expose server-only audit metadata to the client;
- retain an invalid selected member after the active view excludes it.

Each mutation must preserve enough public behavior to reach quality scoring
where applicable. The starter must fail at least one semantic or quality probe.

## Offline Admission Gate

1. Implement a minimal fixed client manifest and prove reference, starter and
   five mutations twice in the pinned RSC runtime.
2. Confirm all payload probes are stable across fresh server renders and that
   no RSC error frame contributes to the score.
3. Freeze public task, starter, private evaluator, reference, source record,
   snapshot and `server-dedup-props.md` audit before any API request.
4. Verify full G1 rule context by hash in a no-API dry-run. A first paired
   diagnostic may run only after the preceding gates pass; it cannot produce a
   formal record or conclusion.
