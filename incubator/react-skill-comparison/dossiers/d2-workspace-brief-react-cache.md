# D2 — workspace brief React cache

**Status:** retired after rule-behavior audit
**Proposed task:** `workspace-brief-react-cache/v1`
**Relevance target:** direct

## Admission evidence

- Public cases: [SWR #3013](https://github.com/vercel/swr/issues/3013) and
  [SWR #4282](https://github.com/vercel/swr/pull/4282).
- Product abstraction: several server panels render the same workspace brief.
  The domain, API, identifiers, output shape, and evaluator are original; no
  source patch, cache API, or rule wording appears in the public task.
- Rule boundary: the agent-visible task card may declare
  `server-cache-react.md` and `async-dependencies.md` for the existing public
  context delivery mechanism. The public task text names neither rule nor
  implementation primitive.

## Public product contract

`createWorkspaceBriefLoader(api)` returns a loader used by several panels in
one server render. The loader accepts a workspace identifier, trims it, and
returns `null` without I/O when it is blank. A non-blank brief contains the
workspace, its quota, and summaries for its pinned projects.

Within one server render, panels that request equal normalized identifiers
share all work, including an in-flight result or rejection. A later render
starts fresh work. Workspace and quota reads are independent and start
together. Pinned-project summary work starts as soon as the workspace is
available, without waiting for an unrelated quota read. Missing workspaces do
not request pinned projects. Every repository error retains its original error
object. No dependency may be added and the supplied React server runtime is an
existing pinned dependency.

## Private evaluator design

### Semantic hard gates

- Blank and whitespace-only identifiers perform no reads.
- The aggregate has the declared shape, preserves normalized identifiers, and
  skips dependent project reads for a missing workspace.
- Workspace, quota, and project failures preserve their original error object.
- Equal normalized inputs called from separate panels observe the same declared
  value or original rejection.

### Deterministic quality score

Only after all semantic gates pass, score the following deferred-call probes:

| Probe | Points | Observable |
| --- | ---: | --- |
| same-render sharing | 30 | one call each to workspace, quota, pinned-project IDs, and summaries across three equal normalized panel inputs |
| render-scope freshness | 10 | an independent server render starts fresh repository work after a fulfilled or rejected render |
| independent roots | 30 | workspace and quota calls start before either deferred value settles |
| partial-dependency fan-out | 30 | pinned-project and summary work starts after workspace resolution but before quota resolution |

The evaluator uses repository call counters and deferred promises only. It
does not use wall-clock thresholds, prompt text, hidden rule names, or agent
trace contents to determine a score.

## Required mutation resistance

- no request-scope sharing;
- a cache keyed by a fresh object instead of canonical primitive arguments;
- a module-global map that leaks across server renders or retains a rejection;
- serial workspace/quota roots;
- a root-wide barrier that delays project work until quota resolves; and
- any wrapper that replaces a repository error.

At least three independent mutations must be rejected by the finished private
evaluator. The starter must fail a dynamic probe while preserving compilable
interfaces.

## Offline admission gate

1. Recheck the two public links and record any change in this dossier.
2. Build the task only against the pinned React server runtime already used by
   the benchmark; do not introduce a cache shim.
3. Run the reference twice, starter negative calibration, and at least three
   mutation rejections twice each. Regenerate a formal snapshot only after all
   checks pass.
4. Verify public rule declaration and full inline context hashes without an API
   request. If either declared rule is unavailable, retire this candidate rather
   than weakening the task or selecting a different rule after a model run.
5. Run at most the pre-registered pilot after the task revision is frozen. If
   both conditions score 100 in the first paired pilot, retire it as a ceiling
   fixture rather than spending repeat budget.

## Retirement Decision

The direct-task rule-behavior gate requires every quality probe and mutation to
map to a concrete behavior in an actually delivered rule. D2 can map its
request sharing and dependency-start probes, but its required
`wrapped-repository-error` mutation concerns error identity, which neither
`server-cache-react.md` nor `async-dependencies.md` specifies. Assigning it a
rule would be a false causal claim. The revision is therefore retained for
history but retired from the active direct set before any G0/G1 API pilot.
