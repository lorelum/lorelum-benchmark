## Why

Issue #195 confirmed that the repository's rules are not only numerous; some are stored at the wrong scope. Root `AGENTS.md` currently turns Practice-effectiveness design choices into a gate for unrelated work, while stable OpenSpec specs retain #74 and #89 historical decisions as if they were future defaults. The current CI also does not execute the repository's stated strict OpenSpec validation or prevent newly changed stable specs from retaining generated `Purpose: TBD` text.

The fix is to make rule placement and promotion explicit without creating a registry, a universal N/A form, or new layers of duplicated instructions.

## What Changes

- Converge root `AGENTS.md` on universal invariants, process routing, Plan-mode confirmation, and a generic rule-applicability / stable-rule-promotion boundary.
- Move detailed `practice-card` and `project-convention/v1` delivery rules from the root file to the existing treatment documentation.
- Modify `openspec-pr-continuity` so it governs generic OpenSpec continuity, applicable planning, and promotion to stable specs, rather than #74 history or Practice-specific controls.
- Add the Practice-effectiveness control design requirement to the scoped `practice-benchmark-boundaries` capability.
- Retire the unreferenced `practice-candidate-expansion` stable capability; its #89-specific history remains in the archived change.
- Pin OpenSpec 1.3.1 for CI, run strict validation in CI, and add a changed-stable-spec Purpose guard.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `openspec-pr-continuity`: replace history- and experiment-specific workflow text with generic continuity, applicable-planning, and stable-promotion requirements.
- `practice-benchmark-boundaries`: require control design only for changes that explicitly declare Practice-effectiveness measurement.
- `practice-candidate-expansion`: remove #89-specific requirements from the active stable-spec set; archived #89 evidence remains unchanged.

## Impact

- `AGENTS.md`, `treatments/README.md`, and the three listed stable OpenSpec capabilities.
- `package.json`, `bun.lock`, a new cross-platform Purpose-guard script/test, and `.github/workflows/validate.yml`.
- No suite, task revision, candidate, snapshot, evaluator, runner behavior, treatment semantics, environment, formal record, or model invocation changes.
