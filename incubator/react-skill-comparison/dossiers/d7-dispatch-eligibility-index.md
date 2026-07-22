# D7 - dispatch eligibility index

**Status:** retired after local diagnostic ceiling
**Task:** `dispatch-eligibility-index/v1`  
**Skill relevance:** direct

## Admission evidence and independence

- Public cases: [Mac-OS-9-React #52](https://github.com/Liiift-Studio/Mac-OS-9-React/issues/52)
  and [peer-learning #766](https://github.com/durdana3105/peer-learning/issues/766).
  Both identify repeated array membership checks in a work-item loop as a
  quadratic cost, in unrelated application domains.
- Product abstraction: a dispatch board classifies queued work against an
  operator-provided eligibility roster. The work-item model, response shape,
  invalid-input behaviour, data set, and evaluator are original. Neither
  public task material copies source code, a patch, a rule name, or an
  implementation primitive from either case.
- Rule boundary: the public task card may declare only
  `js-set-map-lookups.md` for the existing verified G1 context delivery. The
  task text must not mention that rule, `Set`, `Map`, complexity notation, or
  a required algorithm.

## Public product contract

`buildDispatchPlan(items, eligibleAssigneeIds)` receives an ordered work queue
and an operator roster. It returns a plan with `dispatchableIds` and `blocked`
entries. It considers only `queued` items. For every queued item, exactly one
of the following applies, in input order:

- a missing or whitespace-only assignee produces `{ id, reason: "unassigned" }`;
- an assignee absent from the normalized roster produces
  `{ id, reason: "ineligible" }`; or
- a present assignee contributes the original work-item ID to
  `dispatchableIds`.

Roster identifiers are normalized by trimming; blank roster values and
duplicates have no extra effect. The function must not mutate either input,
must preserve the identity and order of valid input IDs, and must reject an
item with a duplicate, blank, or non-string work-item ID before returning a
partial plan. Non-queued items are ignored. No I/O, global state, or external
dependency is permitted.

## Private evaluator design

### Semantic hard gates

- Classifies every queued item exactly once, preserves input order, and ignores
  non-queued entries.
- Normalizes roster and assignee identifiers as declared, including duplicated
  and blank roster values.
- Does not mutate the queue, work-item objects, or roster.
- Rejects malformed work-item identifiers before any partial result escapes;
  a subsequent valid call remains independent.

### Deterministic quality score

Only after all semantic gates pass, the evaluator runs a large, fixed queue
against an instrumented ordinary-array-compatible roster. The probe records
calls to the roster's `includes` method and its iterator; it never measures
elapsed time.

| Probe | Points | Observable |
| --- | ---: | --- |
| reusable eligibility index | 70 | no per-item `includes` membership scans across the fixed queued work set |
| bounded index ownership | 30 | a bounded number of roster passes occurs for one invocation, rather than rebuilding an index per queued item |

The instrumented roster remains iterable and has standard array lookup
semantics. It counts membership scans, high-level roster traversals, and index
reads, so an equivalent single local index built with an iterator, array
method, or indexed loop is accepted. It is not exposed in the public
workspace. A semantic pass with a naive scan is therefore valid code but earns
a deterministic quality score of zero; a quality score is only reported after
the semantic hard gates pass.

## Required mutation resistance

- call `eligibleAssigneeIds.includes(...)` for every queued item;
- construct a fresh membership index inside the item loop;
- retain a module-global index that contaminates a later call with a different
  roster;
- omit normalization or treat a blank assignee as eligible; and
- return a partial plan before rejecting a duplicate or malformed item ID.

The finished evaluator must reject at least three independent mutations twice,
and must distinguish the first two through deterministic quality probes rather
than a wall-clock threshold.

## Offline admission gate

1. Recheck the two public links and record any material change in this dossier.
2. Implement an original starter, reference, and private evaluator in a new
   task revision only after this contract is reviewed; do not alter an existing
   revision or active set for this candidate.
3. Run the reference twice, starter negative calibration twice, and at least
   five mutations twice. The reference must score 100, the starter must fail a
   dynamic quality assertion, and results for identical candidates must be
   identical.
4. Verify `js-set-map-lookups.md` is present in the fixed v2 bundle and is
   delivered as complete, hash-verified inline G1 context. G0 must receive no
   Skill or rule context. This check may use the public task material and the
   fixed bundle only; private evaluator material cannot choose the rule.
5. Freeze public files, private evaluator, reference, source record, rule
   audit, and snapshot before any API call. If the first paired diagnostic is
   `100/100`, retire the revision for ceiling effect rather than spend repeat
   budget.

## Offline calibration

On 2026-07-22, the private reference passed every semantic gate and received a
`100` quality score. The public starter failed dynamically. Five independent
mutations were rejected: repeated array scanning (`30` quality), per-item index
construction (`70` quality), cross-call roster leakage, missing normalization,
and ignored invalid IDs. The public declaration was then calibrated against
the pinned v2 bundle, selecting the complete `js-set-map-lookups.md` context.
The revision snapshot was written after calibration. At this admission point,
no model request, run workspace, artifact, experiment plan, result record, or
conclusion had been created.

## Retirement

On 2026-07-22, an ignored local diagnostic ran the baseline once in the pinned
local container after a passing public-only dry-run. The baseline trace was
valid, had no Skill or rule access, and the private evaluator gave a semantic
pass with a `100` quality score. This is a baseline ceiling, so the paired G1
run was intentionally not started. The local workspace, artifacts, temporary
plan, and request files are removed; no `results/records` entry, formal
manifest, or comparison conclusion exists. The task is retired from the active
set while its source, snapshot, reference, evaluator, and calibration evidence
remain available for explicit replay.
