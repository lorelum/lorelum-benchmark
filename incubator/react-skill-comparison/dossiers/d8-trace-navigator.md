# D8 - trace navigator

**Status:** v1 retired; v2 admitted to offline-calibrated pilot
**Task:** `trace-navigator/v2`
**Skill relevance:** direct

## Admission evidence and independence

- Public cases: [Jaeger UI #4193](https://github.com/jaegertracing/jaeger-ui/issues/4193)
  and [Caja #52](https://github.com/getcaja/caja/issues/52). The first reports
  repeated span-to-row scans during keyboard navigation; the second covers
  repeated frame and parent lookup during interactive edits.
- Product abstraction: an operations trace viewer offers selection and parent
  navigation over an ordered, filterable row snapshot. The data model,
  mutation API, validation rules, response objects, and evaluator are original;
  no public source, patch, data shape, or solution is copied.
- Rule boundary: the public task card may declare only `js-index-maps.md` for
  verified G1 context delivery. The public task text must not name a rule,
  `Map`, complexity notation, lookup index, or implementation tactic.

## Public product contract

`createTraceNavigator(rows)` owns one ordered trace-row snapshot. Each row has
a non-empty `spanId`, an optional `parentSpanId`, and a `visible` flag. The
navigator exposes:

- `locate(spanId)`, returning a row position or `null` for an absent or blank
  identifier;
- `parentOf(spanId)`, returning the parent row position, `null` for a root,
  and `null` when the requested span is absent;
- `step(spanId, direction)`, returning the next or previous visible row as
  `{ spanId, position }`, or `null` at a boundary, for an absent identifier,
  or when the current row is hidden; and
- `replace(rows)`, which atomically installs a new valid snapshot.

Rows preserve their supplied order; positions are zero-based. A row may refer
to a parent only when that parent is present in the same snapshot. Repeated,
blank, non-string IDs and dangling parents make a snapshot invalid. The
constructor and `replace` must reject an invalid snapshot without mutating the
currently observable navigation state. Inputs must not be mutated; no I/O,
module-global state, or external dependency is permitted.

## Private evaluator design

### Semantic hard gates

- Exact position, parent, root, absent, hidden, and visible-boundary behaviour
  follows the public contract across an irregular ordered fixture.
- Constructor and `replace` reject duplicate, blank, and dangling references;
  a failed replacement leaves all prior navigation results unchanged.
- A successful replacement removes every old position and parent relationship,
  installs every new relationship, and does not mutate either input snapshot.
- Two independent navigators with overlapping span IDs never affect one
  another.

### Deterministic quality score

Only after semantic success, the evaluator passes an ordinary-array-compatible
row snapshot whose `find`, `findIndex`, iterator, and indexed access are
instrumented. It performs fixed repeated `locate`, `parentOf`, and visible-step
navigation probes before and after a replacement. It uses no wall-clock
threshold.

| Probe | Points | Observable |
| --- | ---: | --- |
| current-snapshot direct resolution | 45 | repeated location and parent resolution make no row-search calls |
| replacement ownership | 30 | one bounded snapshot materialization per successful replacement, not a scan or rebuild per query |
| stale-state eviction | 25 | post-replacement queries use only the new snapshot and parent relations |

The counter accepts equivalent bounded construction with an iterator, array
method, or indexed loop. It rejects a per-query scan or a hidden module-global
cache through operation counts and independent-navigator probes, not a
particular implementation syntax.

## Required mutation resistance

- scan `rows.find` or `rows.findIndex` for each `locate` or `parentOf` query;
- construct a fresh ID-to-position structure inside each query;
- retain stale rows or parent positions after a successful replacement;
- mutate the current state before rejecting a malformed replacement;
- share a module-level navigation structure between independent instances; and
- accept a dangling parent or duplicate span ID.

At least five independent mutations must be rejected twice. The starter must
compile but fail at least one dynamic semantic or quality assertion.

## Offline admission gate

1. Recheck both public links and record material changes here.
2. Implement the candidate only after this dossier review, with an original
   starter, reference, evaluator, mutations, source record, rule audit, and
   snapshot. Do not modify D2 or any retired revision.
3. Run the reference twice, starter negative calibration twice, and at least
   five mutation rejections twice. A reference must score 100 and identical
   candidates must produce identical scores.
4. Verify that public task materials select and fully inline only
   `js-index-maps.md` from the fixed v2 bundle; the private audit cannot choose
   the G1 rule. G0 must receive neither Skill nor context.
5. Freeze all task materials before any API call. The first paired local
   diagnostic is only for injection and discrimination; if G0 reaches 100,
   retire the revision without running or repeating G1.

## Offline calibration

On 2026-07-22, the v1 private reference passed every semantic check and received
a `100` quality score. The public starter failed dynamically. Six independent
mutations were rejected: repeated row scanning and per-query position rebuilds
each preserved semantic behavior but scored `55`; stale replacement,
non-atomic replacement, module-global state, and dangling parents failed
semantic gates. The public declaration was calibrated against the pinned v2
bundle and selects the complete `js-index-maps.md` context. The revision
snapshot was written after calibration.

## V1 retirement and V2 clarification

One ignored local G0 diagnostic then exposed a public-contract gap: the v1
evaluator required later caller mutations of row objects to leave the installed
snapshot unchanged, while the v1 public task only prohibited the navigator from
mutating inputs. The valid G0 trace had no Skill access, but its candidate made
only an array copy and therefore failed this unstated assertion. It is not an
interpretable model result, so G1 was not run and no record or conclusion was
created. V1 is retained and retired. V2 makes independent row-object snapshot
isolation an explicit public requirement, retains the same private evaluator,
and must repeat all offline calibration before any later diagnostic.

## V2 offline calibration

On 2026-07-22, v2 repeated the full offline gate: the reference scored `100`,
the starter failed dynamically, and all six mutations were rejected. The active
public declaration again selects the complete `js-index-maps.md` context from
the fixed v2 bundle. V2 has no model request, workspace, artifact, experiment
plan, result record, or conclusion; any future diagnostic must use v2 rather
than the retired v1 revision.
