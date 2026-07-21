# D1 — member hub loader

**Status:** design only
**Proposed task:** `member-hub-loader/v1`
**Skill relevance:** direct

## Product framing

Build a member hub result for a valid `memberId`. The result contains the
member profile, the organisation chosen from that profile, the organisation's
projects, the member's pending reviews, and an optional activity panel. A
whitespace-only identifier returns `null` and must not contact the repository.

The profile and organisation lookup do not depend on each other. Projects and
reviews become eligible after the organisation is known; the activity panel is
eligible only when requested and uses the project identifiers. All repository
errors retain their original object identity.

## Semantic hard gates

- Reject blank identifiers without recording a repository operation.
- Return the declared aggregate shape with the profile's selected organisation.
- Do not request activity when the caller disables the panel.
- Propagate a root or dependent repository rejection unchanged.
- Do not issue dependent reads if their prerequisite rejects.

## Deterministic quality probe

The evaluator injects deferred repository methods that append named events to
a logical start trace. It releases root calls in controlled order and verifies:

- both independent roots have started before either is released;
- the project and review reads start after, and only after, the organisation
  resolves;
- those eligible dependent reads start in the same logical turn; and
- activity is absent from both the trace and call count when disabled.

No wall-clock deadline is used. A semantic pass receives a quality score from
the four trace assertions; any semantic failure receives `0`.

## Required mutation resistance

The evaluator must reject a serial-root mutation, a mutation that always reads
activity, and a mutation that wraps repository errors in a new error. It must
also reject a version that starts organisation-dependent work before resolving
the organisation.

## Source abstraction

The two D1 source cases establish that route/dashboard data can accidentally
form a waterfall. This task uses an original member-hub model and does not
reuse their routes, fetch functions, reproduction, or repair.
