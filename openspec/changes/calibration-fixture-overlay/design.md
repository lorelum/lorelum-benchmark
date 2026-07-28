## Context

Issue #106 addresses calibration-only duplication introduced by the two
`injection-calibration/v1` candidates merged in #97. Each candidate currently
keeps four independently executable fixture trees under `private/calibration/`,
although most files duplicate its public starter. The existing kernel v1
materializer copies only public source, isolation audits private source against
the workspace, calibration drivers read fixture paths directly, and snapshot v1
records files and a resolved public workspace hash. No shared fixture resolver
or composite fixture identity exists.

The implementation must retain all sources in the repository, pin every input
with a digest, and give snapshot, materialization, isolation and calibration the
same resolved tree. Private Practice cards and their paths remain excluded from
agent workspaces, public prompts, traces, ordinary snapshot file lists and
generated output.

## Goals / Non-Goals

**Goals:**

- Define a version-fixed, repository-local calibration fixture base + overlay
  contract with deterministic directory resolution.
- Bind base, declaration, overrides and the composite tree to snapshot v1
  resolved identity, without changing snapshot v2 scope.
- Fail closed for malformed or ambiguous declarations and ensure every consumer
  resolves exactly the same tree.
- Preserve #75 and the source pin, task wording, Practice, quality thresholds
  and prior conclusions of #97.

**Non-Goals:**

- Snapshot v2, starter sharing for suite tasks, external/mutable references,
  symlinks, deletion of historical source, formal records, or Pi/model/
  retrieval/blind-review execution.
- A migration of frozen, retired, pilot, official or published revisions.

## Decisions

### Stable contract boundary

The resolver will live in versioned kernel code and expose a single composed
fixture-tree result to all four consumers. Each consumer MUST consume this
result rather than reimplementing directory copy, digest, ordering or deletion
logic. This eliminates divergent interpretations of one declaration.

The contract will accept only regular files beneath a declared repository-local
root. It will reject absolute paths, traversal, generated-output directories,
symlinks, base absence, digest mismatch, cycles, duplicate/ambiguous ownership
and any unsupported operation. The exact declaration layout and deletion syntax
remain gated by the open questions below.

### Immutable identity and snapshot v1

The resolved snapshot will carry an explicit composite-fixture identity derived
from a canonical, sorted manifest of declaration bytes, base identity, override
identity and resulting file hashes. Snapshot verification will re-resolve the
tree and compare that identity, so either a base or override change invalidates
the frozen input. This extends only `resolved` fields; it does not alter or
replace snapshot v1's ordinary `files` contract and does not implement #107's
snapshot v2 work.

### Privacy and execution boundary

Composed calibration trees stay private and are available only to calibration
processes. Materializing the candidate's agent-facing workspace continues to
copy public task/starter input only. Isolation will audit the resolved private
fixture tree with the same public equivalence rules it applies today, while
rejecting Practice text, `private/practices/` paths and private-only content in
the workspace or public artifacts.

## Risks / Trade-offs

- [A shared base can silently rewrite past calibration inputs] -> Require a
  repository-local digest pin and include the composite identity in resolved
  snapshot verification.
- [Several consumers can resolve a declaration differently] -> Export one
  resolver and test equal composed manifests/hashes across each consumer.
- [Overlay syntax can hide a deletion or ownership ambiguity] -> Choose and
  document explicit, fail-closed conflict and deletion semantics before coding.
- [Migration of #97 can alter its already established evidence] -> Keep the
  first scope in incubator and only migrate after the owner confirms how an
  unmerged/merged dependency is handled; do not alter source pin or conclusions.
- [Private calibration becomes agent-visible] -> Materialize only public trees,
  test leakage paths and exclude Practice material from snapshot ordinary files.

## Migration Plan

1. Complete strict OpenSpec validation and create this change's OpenSpec-only
   PR.
2. Obtain and record the five planning confirmations below in Issue #106,
   this design and `tasks.md`.
3. Implement the versioned resolver, its shared consumer adapters and focused
   tests before changing any candidate source.
4. Subject to the approved migration scope, convert only selected incubator
   calibration fixture copies to a committed base plus committed overlays;
   regenerate and verify their snapshot identities without changing their
   public behavior, Practice, source pin or quality gates.
5. Keep the complete committed base and overlays as reproducible source; a
   rollback restores full fixture copies in a new commit rather than deleting
   historical evidence.

## Open Questions

Implementation is blocked until the requester confirms all of the following:

1. Is v1 limited to calibration fixtures within one candidate, or may it share
   bases across candidates that use the same kernel/materializer?
2. What exact base/override declaration format is approved, including conflict
   precedence and whether deletions are supported and explicit?
3. How must the composite tree's immutable identity bind to snapshot v1: which
   resolved fields are authoritative in addition to the ordinary file list?
4. Is migration limited to incubator, and how must this change depend on or
   coexist with #97 while it is unmerged?
5. Which driver/materializer/isolation/evaluator entry points must consume the
   shared composed tree, and which output is the cross-consumer equality oracle?
