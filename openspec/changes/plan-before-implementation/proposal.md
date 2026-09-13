## Why

OpenSpec artifacts describe a proposed change, but they do not by themselves prove that the implementation direction matches the requester's intent. In Issue #195, implementation began after an OpenSpec was prepared without first presenting the practical effect, rule-placement boundary, and validation cases for confirmation; the result addressed a narrower problem than the requester needed.

The repository needs a short, visible planning-and-confirmation gate between a strict-valid OpenSpec / initial OpenSpec-only PR and any non-OpenSpec implementation. This prevents an agent from turning a plausible interpretation into repository policy before the requester can check its scope.

## What Changes

- Require a user-visible Plan-mode planning phase after an OpenSpec change is strict-valid and its initial OpenSpec-only PR exists, and before any non-OpenSpec implementation begins.
- Define the minimum plan content: intended outcome, exact write scope, non-goals, expected behavior, validation/counterexamples, and unresolved decisions.
- Require explicit requester confirmation before implementation; materially changing the approved scope, semantics, or rule applicability returns the change to the planning-and-confirmation gate.
- Keep OpenSpec drafting, strict validation, initial-PR creation, and read-only investigation available before confirmation; do not use the gate to add a new issue, registry, or routine report for trivial work.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `openspec-pr-continuity`: add the visible Plan-mode and requester-confirmation gate between OpenSpec readiness and implementation.

## Impact

- `AGENTS.md`: later implementation will state the universal planning gate concisely.
- `openspec/specs/openspec-pr-continuity/spec.md`: later implementation will add the stable requirement and scenarios.
- This change affects process behavior only. It does not modify suites, tasks, evaluators, runners, treatments, environments, formal records, or execute model calls.
