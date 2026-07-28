## Context

`core/v1` audits a materialized workspace by rejecting any workspace file whose
basename or SHA-256 matches a file under the supplied private path. Candidates
keep independently executable reference, equivalent, and anti-pattern apps
under `private/calibration/`. Those apps intentionally repeat public starter
files such as lockfiles, configuration, and shared implementation, so the
current hash comparison reports legitimate materializations as leaks.

The audit remains a security boundary. It must still reject private path
segments, sensitive filenames, and files whose content exists only in private
material. This change resolves #104 and is independent of #89 candidate
definition, snapshots, Practice injection, and execution.

## Goals / Non-Goals

**Goals:**

- Allow an audit to identify a calibration file as public-equivalent only when
  its bytes also occur in an explicitly supplied public source root.
- Limit the exemption to regular files below `private/calibration/`.
- Keep all non-calibration private hashes, private path segments, and sensitive
  basenames fail-closed.
- Cover a calibration-bearing candidate and a neutral real-leak fixture.

**Non-Goals:**

- Materializing, exposing, snapshotting, or logging any private calibration or
  Practice content.
- Treating an equal hash in the workspace as sufficient proof of public
  equivalence.
- Changing candidate fixtures, profile runtime behavior, model execution, or
  formal benchmark records.

## Decisions

### Require an independent public-source comparison for the exemption

The isolation input will carry public source roots in addition to private
paths. A calibration file can be removed from the private-hash leak set only
when a regular file under those source roots has the same SHA-256. The workspace
is deliberately not used as evidence because it is the object being audited.

Alternatives considered:

- Ignore all files below `private/calibration/`: rejected because a private
  Practice, oracle, or evaluator could be copied there and leaked undetected.
- Trust any matching workspace hash: rejected because a copied private file
  would prove itself non-sensitive.
- Match only paths or basenames: rejected because private calibration layout is
  intentionally independent of public source layout and names alone do not
  establish content equivalence.

### Preserve fail-closed checks before the hash exemption

Path segments named `private` and any basename appearing in the complete private
tree remain immediate leakage findings. The exemption applies only to the
content-hash comparison after those checks, so a copied `oracle.yaml` cannot be
made safe merely by duplicating it in calibration.

### Make omitted public roots fail closed

Callers that do not provide public roots retain the existing behavior: every
private hash participates in comparison. This preserves compatibility for
targeted private-file audits and avoids silently weakening existing callers.

## Risks / Trade-offs

- [A sensitive file is duplicated verbatim in public source] -> Its contents are
  already public, but its private basename and `private` path checks still fail
  if copied into a workspace. Candidate authors must not assign private-only
  names to public files.
- [A caller supplies an incorrect public root] -> The audit remains fail-closed
  unless that root actually contains byte-identical content; kernel CLI will
  supply the candidate's declared public root.
- [Hash computation cost increases] -> Candidate sources are small and the
  audit already hashes every private and workspace file; tests will cover the
  added source scan.

## Migration Plan

1. Extend the isolation input with optional public-source roots and update the
   kernel CLI's candidate audit to pass `candidate/public`.
2. Add focused regression tests, including private calibration duplicates and
   a real private leak.
3. Run the focused kernel suite and `bun run validate`.
4. Roll back by omitting public roots or reverting the core change; the prior
   fully fail-closed hash behavior is preserved.

## Open Questions

None. Issue #104 fixes the boundary without changing Practice, task behavior,
or model execution parameters.
