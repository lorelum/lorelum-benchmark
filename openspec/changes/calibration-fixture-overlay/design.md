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

The registry is global, versioned and excluded from candidate discovery under
`incubator/calibration-bases/`. A registry version has `base.yaml` that pins
the compatible kernel profile, materializer and `source` directory. A candidate
declares `private/calibration/sets.yaml` through `private/candidate.yaml` and
may define any number of named `id` + `version` calibration sets. Each set has
named trees: a root pins `base.ref` + `sha256`, while child trees use `extends`
and a candidate-local overlay `path` + `sha256`.

Overlays add files or replace the same relative file. Deletion is unsupported.
The resolver accepts only regular files beneath the declared roots and rejects
absolute paths, traversal, generated-output directories, Practice paths,
symlinks, missing/incompatible bases, digest mismatch, cycles, duplicate set
keys and unsupported declarations.

### Immutable identity and snapshot v1

Each fixture has a canonical sorted tree hash. A set hash includes the canonical
tree declarations and fixture hashes; `calibration_sets_hash` aggregates all
declared set hashes in stable order. Snapshot v1 records this aggregate in
`resolved.calibration_sets_hash` and re-resolves it during verification. A base,
overlay, declaration or composed-tree change therefore invalidates the input.
This extends only `resolved` fields; it does not alter or replace snapshot v1's
ordinary `files` contract and does not implement #107's snapshot v2 work.

### Privacy and execution boundary

Composed calibration trees stay private and are available only to calibration
processes. The kernel stages them in a fresh temporary private directory and
passes its manifest to declared calibration roles through a private runtime
environment value. The kernel also stages a generated-output-free copy of the
public starter there, so calibration dependencies and parser runtime never write
to the candidate source checkout. Materializing the candidate's agent-facing workspace
continues to copy public task/starter input only. Isolation audits both candidate
private inputs and the staged tree with the existing public-equivalence rules.
Practice text, `private/practices/` paths and private-only content are rejected
from the workspace and public artifacts.

## Risks / Trade-offs

- [A shared base can silently rewrite past calibration inputs] -> Registry
  versions are immutable; candidates pin both a versioned ref and its digest,
  and snapshots include the composite identity.
- [Several consumers can resolve a declaration differently] -> Export one
  resolver and test equal composed manifests/hashes across each consumer.
- [Overlay syntax can hide a deletion or ownership ambiguity] -> Only one
  overlay layer per tree is permitted; it can add or replace and cannot delete.
- [Migration of #97 can alter its already established evidence] -> Keep the
  migration in incubator; #97 is the merged baseline and its source pin,
  Practice, task wording, thresholds and conclusions remain unchanged.
- [Private calibration becomes agent-visible] -> Materialize only public trees,
  test leakage paths and exclude Practice material from snapshot ordinary files.

## Migration Plan

1. Complete strict OpenSpec validation and create this change's OpenSpec-only
   PR.
2. Record the confirmed global registry, versioned-set, snapshot, migration and
   shared-consumer decisions in Issue #106, this design and `tasks.md`.
3. Implement the versioned resolver, its shared consumer adapters and focused
   tests before changing any candidate source.
4. Convert the two #97 incubator candidates to a shared base plus committed
   `quality-probe/v1` overlays; regenerate and verify their snapshot identities
   without changing public behavior, Practice, source pin or quality gates.
5. Keep the complete committed base and overlays as reproducible source; a
   rollback restores full fixture copies in a new commit rather than deleting
   historical evidence.

## Confirmed Evolution Model

New candidates reuse registry bases through a compatible pinned ref and digest.
When a candidate receives another Practice or calibration model, it adds a new
named, versioned calibration set rather than rewriting an existing set. The
aggregate resolved hash changes for the current candidate snapshot while the
old set source and identity remain reproducible from its committed history.
