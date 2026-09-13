## Context

The root workspace instructions contain universal lifecycle and visibility constraints alongside detailed Practice delivery forms, a #74 one-time ordering exception, and a planning list that requires related Practice and an equal-length irrelevant control for every OpenSpec implementation. This makes a legitimate local runner repair or a frozen-candidate directional screen appear to owe an unrelated experimental design response.

The same scope leak exists in stable specs. `openspec-pr-continuity` carries #74 history and Practice-specific planning details. `practice-candidate-expansion` was archived from #89's first use of `injection-calibration/v1`, React/Vite, and related candidate constraints, but has no active references outside itself. `practice-benchmark-boundaries` is the appropriate domain contract for Practice-injection conditions, but its generated Purpose is still unresolved.

Existing CI checks benchmark workspace contracts but does not run `openspec validate --all --strict --json`. The local OpenSpec CLI is `@fission-ai/openspec` 1.3.1; the repository does not currently pin it as a dependency.

## Goals / Non-Goals

**Goals:**

- Ensure root rules do not make undeclared experimental methods a gate.
- Retain all valid lifecycle, public/private, treatment-isolation, and formal-execution protection.
- Keep Practice-effectiveness controls mandatory when a change explicitly measures that effect.
- Prevent a change-specific implementation decision from being promoted to a stable capability without an explicit generality judgment.
- Make CI execute strict OpenSpec validation and prevent new/modified stable specs from retaining generated placeholder purposes.

**Non-Goals:**

- Do not create a rule registry, nested `AGENTS.md` hierarchy, calendar automation, or a mandatory task closeout log.
- Do not infer or bulk-fill the remaining legacy `Purpose: TBD` files.
- Do not change historical archived OpenSpec material, including the #74 and #89 source changes.
- Do not use keyword scanning to decide whether a rule is general; historical Issue/version identifiers are valid in scoped capabilities.
- Do not change benchmark fixtures, candidates, suites, runners, evaluators, model execution, records, or experimental conclusions.

## Decisions

### 1. Root rules express universal boundaries and scope routing only

`AGENTS.md` will retain repository-wide invariants and process routing. It will state that domain method requirements bind only when the current change or experiment explicitly declares the corresponding objective; an undeclared condition is neither a gate nor an N/A-reporting obligation. It will also require a stable-spec promotion judgment when a change modifies `openspec/specs/`.

Detailed treatment delivery rules will move, without semantic weakening, to `treatments/README.md`. This existing treatment entry point is preferable to creating a parallel `treatments/AGENTS.md` or duplicating the rules across files.

### 2. OpenSpec continuity is generic; Practice comparison belongs to its domain

`openspec-pr-continuity` will remove the #74 exception and the global Practice-control checklist. Its planning requirement will require Plan mode, explicit requester confirmation, the current change's applicable decisions, and re-confirmation for material divergence.

A new requirement in `practice-benchmark-boundaries` will require baseline, relevant Practice, and an equal-length irrelevant control only when a change explicitly declares that it measures Practice effectiveness. The negative scenario states that an undeclared study does not need to create or explain that control.

### 3. Retire, do not generalize, the unreferenced #89 expansion capability

`practice-candidate-expansion` has no active references outside its own stable file. Its requirements combine #89, fixed runtime/profile choices, and historical execution handoff. OpenSpec cannot archive a capability with zero remaining requirements, so this change directly removes the active stable capability after confirming that no active file references it. The archived #89 change remains the historical source; the archive operation applies the other capability deltas normally.

### 4. CI enforces objective OpenSpec hygiene only

The repository will pin `@fission-ai/openspec@1.3.1` in devDependencies and expose `bun run validate:openspec`. A new Bun script receives a base Git revision, enumerates only added/modified `openspec/specs/**/spec.md` paths in that revision range, and rejects missing, empty, or generated-placeholder Purpose sections. It does not attempt semantic classification.

The CI workflow gets one governance job: install locked dependencies, run strict OpenSpec validation on push and PR, run the purpose-guard unit test, and run the changed-spec guard on PR with GitHub's base SHA. The existing workspace jobs remain unchanged.

## Risks / Trade-offs

- [A historical candidate requirement could still be needed by an active consumer] → confirm no active reference before removal, preserve the archived source, and run strict validation after deletion.
- [A semantic promotion decision cannot be fully linted] → require the explicit Plan/PR judgment; automate only strict structure and Purpose placeholders.
- [Pinning OpenSpec adds a development dependency] → pin the already-tested 1.3.1 version in `bun.lock`, so CI no longer depends on a host-global binary.
- [Moving delivery text could drift from runtime behavior] → move the complete root constraints to the existing treatment document and validate the baseline/oracle/control cases against existing `practice-benchmark-boundaries` and `docs/PI_RUNNER.md` contracts.

## Migration Plan

1. Create and strict-validate this OpenSpec-only change, then open its initial PR referencing #195.
2. Present the approved implementation plan before changing non-OpenSpec files.
3. Implement root/document/spec/CI changes in dependency order; archive the change only after final strict validation.
4. Delete the retired stable capability before archive after confirming no active reference remains; archive the remaining stable-spec deltas and verify the final active catalog.
5. Keep #203 closed and do not merge or reuse its archived rule-freshness change.
