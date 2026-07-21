# C2 — project summary access

**Status:** admitted to offline-calibrated pilot
**Task:** `project-summary-access/v1`
**Skill relevance:** control

## Product framing

Implement a project-summary reader. A project belongs to an organisation and
contains public work items, internal notes, and a non-public work-item count.
Anonymous viewers may see an approved public summary; organisation members may
see all project work items; members of another organisation must receive the
same not-found result as for a missing project. Aggregate fields must obey the
same visibility boundary as item fields.

## Semantic hard gates

- Missing projects and cross-organisation requests have indistinguishable safe
  results.
- Anonymous output includes only approved public fields and approved public
  work items.
- Member output includes only records from the requested organisation.
- No output contains an internal note, internal item ID, non-public count, or
  count derived from inaccessible rows.
- A malformed viewer context is denied without querying project internals.

## Deterministic quality probe

The evaluator uses a repository double that separately records public and
member-projection reads. It scores only after semantic success: anonymous
paths make one public read and no member read, while an authorised member path
makes one scoped member read and no public read. The probe protects the access
boundary; it does not reward framework optimisation.

## Required mutation resistance

Reject malformed viewer expansion, an anonymous member projection, a
distinguishable forbidden response, and an unnecessary public read before a
member projection.

## Offline calibration

On 2026-07-21, the private reference passed every semantic gate and received a
`100` quality score. The public starter failed, and four plausible mutations
were each rejected: malformed viewer expansion, anonymous member projection,
distinguishable forbidden response, and eager public read for a member. The
revision snapshot was then written. This task is a control: it is reported
separately and cannot be used in the direct-task effect estimate.

## Source abstraction

The source cases establish permission and tenant-boundary failure modes. The
task uses an original project dataset and response contract, and does not reuse
any vulnerability, permission query, or fix.
