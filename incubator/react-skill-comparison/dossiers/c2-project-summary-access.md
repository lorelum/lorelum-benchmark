# C2 — project summary access

**Status:** design only
**Proposed task:** `project-summary-access/v1`
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

The evaluator uses a repository double that separately records public summary,
internal-detail, and aggregate reads. It scores only after semantic success:
unauthorised paths must make no internal-detail read, while authorised member
paths make exactly the reads necessary for their declared response. The probe
protects the access boundary; it does not reward framework optimisation.

## Required mutation resistance

Reject filtering private fields after returning all rows, a total count over
all organisation items, a distinguishable forbidden response, and a reader
that loads internal details before validating the viewer.

## Source abstraction

The source cases establish permission and tenant-boundary failure modes. The
task uses an original project dataset and response contract, and does not reuse
any vulnerability, permission query, or fix.
