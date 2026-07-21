# React Skill fixture selection ledger

This ledger is the admission gate for the version 0.4.0 pilot set. A task may
not move into `suites/` until both source links are independently reviewed and
the offline calibration checklist is complete.

The screened public-case pool lives in
[public-case-candidates.md](public-case-candidates.md). It supplies external
validity only; it is not task text, evaluator material, or an answer source.

The per-slot design dossiers live in [dossiers/](dossiers/). They define the
future semantic gates and deterministic probes, but remain design-only until
reference, starter, mutations, and snapshot complete offline calibration.

## Fixed matrix

| Slot | Relevance | Mechanism | Public-case admission evidence |
| --- | --- | --- | --- |
| D1 | direct | asynchronous dependency orchestration | two public reports of dependent dashboard or route work starting serially |
| D2 | direct | request-scope deduplication | two public reports of duplicate same-request reads or cache-scope bugs |
| D3 | direct | derived state and stable identity | two public reports of memoized rows or callback identity regressions |
| D4 | direct | global listener ownership | two public reports of duplicate browser listeners or incomplete cleanup |
| D5 | direct | storage read-through caching | two public reports of repeated browser storage reads or hydration work |
| D6 | direct | conditional loading boundary | two public reports of eagerly loaded optional client features |
| C1 | control | external event/data validity | two public reports of malformed external event payloads |
| C2 | control | authorization and public data boundary | two public reports of tenant/authorization data exposure |
| C3 | control | domain transition and error propagation | two public reports of invalid state transitions or swallowed errors |

## Per-slot dossier requirements

For every slot, record two reviewed GitHub issue/PR/performance-incident
permalinks, a one-paragraph abstraction of the business workflow, and a
statement that neither public prompt nor private evaluator copies the original
patch or rule wording. Reject a candidate if it needs a network service, a
non-Bun dependency, an unstable wall-clock assertion, or lacks a hidden dynamic
probe.

## Offline admission checklist

- The public task describes interfaces and product constraints, not rule names
  or implementation primitives.
- The private evaluator has semantic hard gates plus deterministic resource,
  scheduling, or identity probes that produce a 0–100 performance score only
  after semantic success.
- Reference passes twice; starter fails a dynamic assertion; three independent
  plausible mutations each fail; the task snapshot is regenerated.
- After any API pilot record exists, defects are corrected only in a new task
  revision.
