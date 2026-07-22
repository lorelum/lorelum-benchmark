# D1 — member hub loader v2

**Status:** successor candidate, rule-behavior design approved  
**Proposed task:** `member-hub-loader/v5`  
**Skill relevance:** direct  
**Pre-registered rules:** `async-dependencies.md`, `async-parallel.md`

## Admission sources

- [Next.js #87534](https://github.com/vercel/next.js/issues/87534), rechecked
  2026-07-21: a server-rendered page with dependent data can expose avoidable
  loading behavior when work is awaited too early.
- [MergeFi frontend #8](https://github.com/MergeFi/frontend/issues/8),
  rechecked 2026-07-21: dashboard routes with multiple independent data sources
  can accidentally form a sequential fetch waterfall.

The task is an original member-hub workflow. Its public prompt and private
evaluator must not copy either report's reproduction, patch, route names, or
rule wording.

## Product framing

Build a member-hub result for a valid `memberId`. It contains a member profile,
an independently available organisation summary, the member's projects in that
organisation, and the member's pending reviews in that organisation. A
whitespace-only identifier returns `null` and must not contact the repository.

Profile and organisation-summary reads are independent roots. Project and
review reads are each eligible only after the organisation summary has
fulfilled. The public task must require preservation of the original repository
error object, but must not name a promise primitive, scheduling API, or Skill
rule.

The optional activity branch from `v1` is deliberately absent. It belongs to
the D6 conditional-loading slot, rather than combining two distinct mechanisms
in this direct task.

## Semantic hard gates

- A blank identifier returns `null` without recording any repository operation.
- The aggregate has the declared profile, organisation, projects, and reviews
  shape and associates the latter two with the selected organisation.
- A rejected profile or organisation summary is propagated as the same error
  object.
- No project or review read begins when the organisation summary rejects.
- A rejected project or review read is propagated as the same error object;
  the other eligible read may still settle without producing an unhandled
  rejection.

## Deterministic quality probes

The private evaluator injects deferred repository methods and a logical start
trace. It controls resolution order without wall-clock thresholds. Only after
all semantic gates pass, it emits these probes:

| Probe | Score | Required observation |
| --- | ---: | --- |
| Independent roots | 50 | Profile and organisation reads both start before either deferred root resolves. |
| Dependent fan-out | 50 | Project and review reads begin only after organisation fulfillment and in the same logical turn. |

A semantic failure receives score `0` and no quality probes. A semantic pass
must receive exactly the total of its named probes through the structured v2
evaluator contract.

## Required mutation resistance

Offline calibration must reject all of the following plausible candidates:

- serial profile/organisation roots;
- serial project/review fan-out after organisation resolution;
- eager project or review reads before organisation resolution; and

The original-error semantic gate deliberately has no mutation. Error identity
is a product-correctness requirement, not behavior taught by either delivered
performance rule.

It must additionally demonstrate that a project rejection does not become an
unhandled rejection merely because reviews were correctly started in parallel.

## Implementation prerequisites

- New revision only: preserve `member-hub-loader/v1`, its snapshot, private
  evaluator, and pilot history unchanged.
- Use `evaluator_contract: structured/v2`; do not retrofit the historical
  Bun-test evaluator.
- Before admission, create reference, starter, three mutation candidates, and
  a regenerated snapshot; run the full offline admission checklist twice for
  deterministic repeatability.

## Rule-Behavior Mapping

`rule-audit.yaml` for v5 must declare only these delivered-rule behaviors:

| Behavior | Delivered rule | Quality probe / mutation |
| --- | --- | --- |
| independent-root-start | `async-parallel.md` | `independent-roots`, `serial-root-reads` |
| dependent-fanout-start | `async-dependencies.md` | `partial-dependency-fanout`, `root-wide-barrier`, `serial-dependent-reads` |

The public semantic checks may retain blank-input, aggregate-shape, dependent
failure and original-error requirements. They must not be represented as
quality probes or mutation mappings. This gives the candidate a complete
causal path from G1 delivery to every scored behavior without falsely claiming
that the Skill teaches repository error identity.
