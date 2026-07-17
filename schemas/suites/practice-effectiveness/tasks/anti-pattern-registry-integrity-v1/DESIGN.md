# Design: Anti-Pattern Registry Integrity

## Claim

For a pack-integrity task involving multiple Practices and a central registry,
injecting `lorelum.format.cross-reference-integrity` should improve complete,
deterministic diagnostics compared with baseline and unrelated retrieval
guidance.

## Why this is a better discriminator

The first calibration task exposed all required metadata fields in one type and
was solved by every condition. This task requires a two-phase design: index the
registry globally, then resolve every Practice reference against that index.
The evaluator will require all independent failures, source-aware diagnostics,
and deterministic ordering. A local first-error loop or a one-pass lookup is
likely to miss part of the result.

## Frozen task shape before implementation

The starter will expose only these product concepts:

```ts
type RegistryEntry = { id: string };
type PracticeFile = { path: string; antiPatternIds: string[] };
type PackInput = { registry: RegistryEntry[]; practices: PracticeFile[] };
```

The agent task will ask it to validate a pack before indexing. It will not name
the required algorithm, expected error order, or all error categories.

## Hidden acceptance oracle

The evaluator will require that the implementation:

1. accepts a valid registry and fully resolved Practice references;
2. reports every duplicate registry id, including duplicate occurrences after
   the first, with the registry location;
3. reports every unresolved reference with both Practice path and referenced id;
4. returns diagnostics in a deterministic order independent of object identity;
5. does not stop after the first error or silently drop a reference.

## Intervention design

The relevant Practice must explain two-pass validation, stable source-aware
diagnostics, and accumulation without encoding test fixture ids. The unrelated
control must have comparable length and code density but discuss a retrieval
concern that cannot solve pack integrity. Neither Practice appears in the task
prompt or starter.

## Freeze gate

Before a run, a reviewer must approve the relevant and unrelated Practice,
confirm that hidden fixtures do not leak through starter names or comments, and
verify the starter fails while a reference implementation passes. The task is
currently design-only and is not a runnable Stage A card.
