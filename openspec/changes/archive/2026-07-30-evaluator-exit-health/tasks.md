## 0. Planning Gate

- [x] 0.1 After the OpenSpec-only PR exists, confirm in #118 and `design.md` that candidate observable behavior, Practice conditions, baseline discrimination, private semantic/quality acceptance, starter/snapshot identity, and model/prompt/budget/blind-review boundaries remain unchanged.
- [x] 0.2 Confirm that `execution-failed` is the evaluator non-health state and historical replays must not install dependencies, mutate workspaces, or rerun Pi/model work.

## 1. Evaluator Health Handling

- [x] 1.1 Update the profile diagnostic runner so only a zero-exit evaluator with complete structured output becomes `evaluated`.
- [x] 1.2 Record evaluator launch, timeout, and nonzero-exit failures as redacted non-healthy entries without semantic, Practice observation, or joint-pass fields.
- [x] 1.3 Preserve zero-exit semantic failures and every valid Practice observation as healthily evaluated outcomes.

## 2. Regression Coverage

- [x] 2.1 Add focused tests for valid structured output followed by a nonzero evaluator exit, including absence of derived comparison fields.
- [x] 2.2 Add focused tests for zero-exit invalid output and zero-exit semantic failure, preserving the independent health contract.
- [x] 2.3 Add a redaction regression test for evaluator-process failure summaries.

## 3. Verification And Replay

- [x] 3.1 Run focused runner tests, `bun run test:pi:v2`, `bun run validate`, OpenSpec strict validation, and a public/private leakage audit; record command outcomes and omissions in the PR.
- [x] 3.2 Perform evaluator-only replay for available #117 historical workspaces without mutating them; record unavailable dependencies or evaluator failures as non-healthy diagnostic outcomes.
- [x] 3.3 Update #117 with the replay outcome and #91 admission decision without creating a model run, formal record, or suite revision.
