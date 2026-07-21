# D1 — member hub loader v3

**Status:** retired after formal public routing failure  
**Proposed task:** `member-hub-loader/v3`  
**Relevance target:** direct

## Public product contract

Build a member workspace for a non-blank identifier. The workspace returns the
member profile, organisation, organisation projects, and pending reviews.
Profile and organisation data become available independently. Once the
organisation is available, project and review work may begin even when the
profile is still pending. Blank identifiers perform no repository work; every
repository failure preserves its original error object.

The public task names no Skill rule, helper package, or promise API.

## Offline quality design

- Deferred repository calls prove both root reads begin before either settles.
- Resolving only the organisation proves project and review reads begin before
  the profile settles, and begin in the same logical turn.
- Semantic gates cover blank input, aggregate shape, error identity, and no
  dependent request after an organisation failure.
- Mutations: serial roots, root-wide barrier before dependent fan-out, serial
  dependents, and wrapped repository error.

## Admission gate

Create a temporary public draft containing only the product contract and
starter interface. The public router must select all independently audited
rules within its three-rule bound before reference or evaluator work starts.
Otherwise retire this draft without creating `v3`.

## Routing result

The initial routing draft covered both target mechanisms, but the completed
formal public task did not retain `async-parallel.md` within the three-rule
context. It is retired before any API run; this evidence blocks further task
wording adjustments until the generic router is improved.
