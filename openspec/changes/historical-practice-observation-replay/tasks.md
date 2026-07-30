## 0. Planning Gate

- [x] 0.1 After this change's OpenSpec-only PR exists, confirm in #117 and
  `design.md` that the two candidates' observable behavior, expected baseline
  discrimination, and relevant/irrelevant Practice controls remain unchanged.
- [x] 0.2 Confirm the private semantic and quality acceptance, redaction
  boundary, immutable starter/source identities, and that no private material
  is placed in public inputs or replay summaries.
- [x] 0.3 Confirm replay does not alter the fixed model, prompt, budget,
  conditions, repetitions, or no-blind-review boundary; it must not call a
  model, create a formal record, or become part of the #91 denominator.

## 1. Read-only Replay

- [ ] 1.1 Locate and validate the declared #90 workspace plan for both
  candidates, retaining every candidate x input hash x condition x repetition
  denominator entry before replay.
- [ ] 1.2 Implement evaluator-only replay against explicit historical
  workspace paths without creating a workspace, invoking Pi, or modifying the
  historical output.
- [ ] 1.3 Classify absent workspaces, invalid output, evaluator failures, and
  usable v2 results with stable audit reasons and independent result axes.

## 2. Redacted Reporting And Decision

- [ ] 2.1 Emit a separate, ignored `profile-diagnostic-summary/v2` that
  preserves v1 summaries and contains only redacted provenance and v2 result
  fields.
- [ ] 2.2 Implement the per-candidate, per-input conservative decision rule
  for `eligible-for-expansion`, `adjust-before-expansion`, and
  `indeterminate`; #91 admits only eligible candidates and pauses when none
  qualify, without cross-input or future-#91 aggregation.
- [ ] 2.3 Add focused tests covering a healthy negative observation, malformed
  evaluator output, missing workspace, redaction, and each decision outcome.

## 3. Verification And Evidence

- [ ] 3.1 Run the two candidate current evaluator/probe calibration paths and
  record their outcomes without model execution.
- [ ] 3.2 Replay every available #90 historical workspace, produce the
  redacted v2 summary, and record all unavailable inputs and the bounded #91
  entry conclusion in #117.
- [ ] 3.3 Run focused replay/runner tests, public/private leakage audit,
  `bun run validate`, `openspec validate historical-practice-observation-replay
  --strict`, and `git diff --check`; record evidence and any unrun command in
  the PR.
