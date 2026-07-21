# D1/D2 pilot task audit — 2026-07-21

## Scope and evidence

This is a design decision, not a run record. The local diagnostic pilot used
the pinned `vercel-skill/v2` source at
`f8a72b9603728bb92a217a879b7e62e43ad76c81`, the local Docker environment, and
three G0/G1 repetitions for D1 and D2. It used an operator-local model version,
produced no `results/records/` entry, and is not evidence for a published G0/G1
conclusion. Raw workspaces, traces, diffs, and logs were deleted after this
aggregate audit was prepared.

All six G1 traces expanded the Skill and completed their pre-registered rule
reads before the first edit. All six G0 traces had no Skill or rule access.

## D1 — `member-hub-loader/v1`

### Rule and task alignment

The task is a genuine direct match. `async-dependencies.md` explicitly gives
the same safe shape as the reference: begin independent roots immediately,
chain work from each fulfilled prerequisite, and await the resulting promises
together. `async-parallel.md` reinforces concurrency only for independent
operations. The public requirement that activity requires a project list and
that original errors are preserved supplies the necessary safety boundary.

The rules therefore do not direct the invalid behavior observed in the pilot.
The implementation must preserve the project promise's rejection while only
creating the activity promise from a fulfilled project result.

### Pilot signal

| Condition | Semantic pass rate | Observed failure pattern |
| --- | --- | --- |
| G0 | 0/3 | All three serialized the organisation-dependent reads. |
| G1 | 0/3 | Two correctly started eligible reads in parallel but left a project-rejection path unhandled; one still failed to start activity after projects resolved. |

G1 has a target-specific signal (2/3 fixes to the serial dependency graph),
but neither condition passes the full semantic gate. This is not sufficient for
a formal direct-task comparison.

### Decision

Preserve `v1` unchanged as a replayable pilot fixture, but do not promote it to
the formal active direct set. Design `member-hub-loader/v2` in the incubator
with the following separation:

- retain the independent-root and organisation-dependent fan-out probe;
- move the optional activity branch into the separate D6 conditional-loading
  fixture, where its dependency and rejection behavior can be isolated;
- make rejection propagation a public product constraint and test every graph
  edge deterministically;
- implement the promised two-layer scorer: semantic hard gate first, then a
  0–100 logical-start/resource score only for semantic passes.

## D2 — `account-summary-request-cache/v1`

### Rule and task alignment

`server-cache-react.md` documents `React.cache()` for per-request
deduplication. The fixture forbids dependencies and exposes neither React nor a
pinned cache primitive, so its reference correctly uses a closure-local
`Map<string, Promise<…>>` instead. The task measures a related engineering
principle, but cannot directly exercise the documented API or its argument
identity semantics. Its current `direct` classification is therefore too
strong for a formal claim about this rule.

### Pilot signal

| Condition | Semantic pass rate | Observed failure pattern |
| --- | --- | --- |
| G0 | 3/3 | None. |
| G1 | 3/3 | None; every trace read `server-cache-react.md` before editing. |

The task has a ceiling effect at the configured model and budget. It cannot
discriminate an incremental G1 benefit, even though the injection audit is
working.

### Decision

Keep `v1` unchanged for historical replay, but remove it from the next formal
direct-task candidate set. A `v2` is admissible only with one of these explicit
choices:

1. provide a pinned React server runtime and let the public task genuinely use
   `React.cache()`; or
2. classify this mechanism as `partial`, then replace D2 with a different
   direct fixture whose required Skill API is available in the pinned runtime.

Do not add a fake cache shim: that would test the shim's contract rather than
the official rule.

## Cross-cutting scorer decision

Both current private evaluators contain deterministic scheduling/call-count
assertions, but expose only an all-or-nothing Bun test result. Their dossiers
and oracle manifests promise a semantic gate plus a 0–100 dynamic quality
score, which is not yet implemented. Before admitting any `v2` fixture, add a
versioned evaluator result format that reports:

- semantic hard-gate status;
- named logical/resource probes;
- a deterministic 0–100 quality score only after semantic success; and
- score `0` when any semantic gate fails.

## Next implementation order

1. Define the versioned evaluator score contract and test harness.
2. Create D1 `v2` and its replacement D2 dossier under `incubator/`.
3. Complete offline calibration: reference, starter negative, three mutations,
   repeatability, and snapshot.
4. Update the suite and coverage manifest only after the new revisions pass
   offline admission; then run a new pre-registered local pilot.
