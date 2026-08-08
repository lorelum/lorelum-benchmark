## Why

The #137 diagnostic pilot shows that the current login-page Judge rubric is not a
credible measure of Practice impact. Pro and Flash produced score differences
from literal regex mismatches (`disabled={flag}` and brace-form guards), while
all conditions were functionally correct and received the same API-boundary
score. The primary score therefore mixes task/UI quality with the API-layering
Practice being tested and can reward or penalize equivalent implementations.

## What Changes

- Preserve `login-page-judge-rubric v1` and its pilot evidence as an immutable
  historical baseline.
- Add a v2 Practice-specific rubric whose primary score measures only the
  `react.api.layered-design` responsibilities.
- Replace literal source patterns with behavior-oriented, AST-backed evidence;
  unresolved or ambiguous module graphs become `indeterminate`, not pass.
- Move functional completion and general form/UI quality out of the Practice
  effect score; retain them as independent semantic or optional quality fields.
- Add calibration fixtures for indirect disabled bindings, brace-form duplicate
  guards, alternate state mechanisms, and ambiguous import graphs.
- Require v2 calibration to prove acceptance of responsibility-equivalent code,
  rejection of the declared anti-pattern, and fail-closed ambiguity handling
  before any new model comparison.

- Review-driven revision (2026-08-05): replace name/source matching with
  data-flow evidence for transport and raw reads, accept promise-chain
  delegation and fail closed on bare external calls, bind boundary translation
  to auth success and failure paths, make component selection deterministic,
  treat non-source imports as irrelevant, expand the calibration matrix to the
  review blind spots with criterion-direction anti-pattern assertions, and add a
  v2 re-evaluation of the six existing v5/v6 pilot outputs as an evidence gate.
  Runner judge-provider wiring and task-starter changes remain out of scope.

## Capabilities

### New Capabilities

- `login-page-practice-judge-v2`: Practice-specific scoring and calibration for
  API/page responsibility boundaries.

### Modified Capabilities

- `practice-benchmark-boundaries`: clarify that Practice-effect scores must not
  include unrelated UI/form dimensions and that unsupported static analysis is
  `indeterminate` rather than negative or positive evidence.

## Impact

- Adds versioned private judge/calibration artifacts for the login-page
  candidate; v1 files, hashes, snapshots, and pilot records are not rewritten.
- Adds focused judge tests and validation evidence; no suite revision, formal
  record, or model run is created by this change.
- Future pilot plans must explicitly select the v2 rubric and report semantic,
  Practice-specific quality, and execution health as separate dimensions.
- The re-evaluation of v5/v6 pilot outputs with v2 is recorded as criterion-level
  evidence; if all conditions score identically, the task lacks headroom and a
  separate change must adjust the task before another pilot.
