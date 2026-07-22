# Realistic React Repository Benchmark v1

**Status:** design only, not an executable task or experiment plan

## Objective

Measure whether `vercel-skill/v2` improves DeepSeek's ability to resolve
performance problems in a small but genuine React/Next.js codebase. Micro
fixtures remain mechanism tests; they cannot be used as the primary result.

## Repository Baseline

Create one pinned Next.js application under `incubator/realistic-react-repo/`
only after this design is reviewed. It must contain:

- an App Router workspace dashboard route with server and client components;
- a repository layer with deterministic in-memory fixtures and deferred-call
  instrumentation;
- an existing component tree, route tests, production build and browser-level
  integration test; and
- a committed lockfile, no external service, no network-dependent test and no
  private evaluator material in the agent workspace.

The agent receives the public repository, a public issue and its existing test
suite. It does not receive benchmark probes, source case patches, rule audits
or expected call traces.

## Pre-registered First Issue

**Workspace dashboard waterfall and duplicate server reads.** A dashboard has
an overview, quota panel and recent-project panel spread across multiple
server-component files. A member-visible issue reports that navigating to a
large workspace delays independent summary data and repeats the same workspace
lookup across panels. The public issue describes the observed route behavior,
the unchanged output contract and the relevant files; it does not name caching,
`Promise.all`, React APIs or a Vercel rule.

The initial rule mapping is fixed before implementation:

| Quality behavior | Delivered rule |
| --- | --- |
| equal normalized workspace reads share one RSC request scope | `server-cache-react.md` |
| independent quota and workspace roots start without a waterfall | `async-parallel.md` |
| project work starts immediately after its workspace dependency resolves | `async-dependencies.md` |

Semantic gates cover route output, empty workspace handling, access behavior
and original repository-error propagation. They are not claimed as Skill
effects and are not represented by rule-attributed mutations.

## Scoring

The private evaluator runs only after public tests pass.

| Layer | Evidence | Purpose |
| --- | --- | --- |
| Functional | route and browser integration assertions | product behavior remains correct |
| Runtime | RSC render call trace, duplicate-read counters and deferred dependency trace | measure the three mapped behaviors |
| Build | pinned production build plus import-boundary assertion | prevent a passing patch from moving server work into an invalid client boundary |

Runtime probes use counters, logical event order and Flight payload records;
wall-clock thresholds are prohibited. A failed functional gate receives zero
quality. The final quality score reports each mapped behavior separately.

## Admission Before Any API Call

1. Freeze two public source incidents for the issue; record links and an
   original-domain statement in a dossier.
2. Write an expert reference and an independently authored, semantically valid
   naive implementation. The reference must outperform the naive solution only
   on the pre-registered mapped runtime probes.
3. Add one mutation per mapped rule behavior. No mutation may target a generic
   correctness property that the rule does not teach.
4. Run reference, naive implementation and mutations twice; then snapshot the
   entire public/private revision.
5. Verify a G1 dry-run contains the complete three-rule context and G0 contains
   none. Only then create the fixed pilot plan.

## Experiment Discipline

Pre-register at least three repository issues before running G1. A one-run G0
difficulty screen may retire a valid `100/100` ceiling issue, but must not
replace it based on G1 output. Remaining issues run G0/G1 with identical
repository commit, prompt, model, budget and container; each condition repeats
three times. Report task-level paired differences, not only an aggregate.
