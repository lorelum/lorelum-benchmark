## 0. Planning Gate

- [ ] 0.1 After the OpenSpec-only PR exists, confirm in #122 and `design.md` that the two candidates' observable behavior, Practice controls, private semantic/quality acceptance, starter and snapshot identity, and #117 historical interpretation remain unchanged.
- [ ] 0.2 Confirm closure versioning, source, integrity identifier, update policy, and offline/CI rebuild path; confirm no host ancestor dependency search or global Bun/Node dependency source.
- [ ] 0.3 Confirm that clean calibration health means both candidate evaluators start reproducibly and emit valid v2 health results, while semantic/probe failures remain distinct from runtime execution failures.
- [ ] 0.4 Confirm no private evaluator/oracle/Practice/calibration material will enter agent workspaces, public prompts, traces, issue, or PR summaries.

## 1. Reproduction And Runtime Contract

- [ ] 1.1 Add an isolated regression that materializes each candidate runtime with parent dependencies unavailable and reproduces the current missing-parser failure before the closure is supplied.
- [ ] 1.2 Add a versioned runtime-closure declaration and validator/resolver version that verifies source, lock input, integrity identifier, resolution root, and rebuild policy without rewriting frozen helper behavior.
- [ ] 1.3 Define the isolated runtime launcher so evaluator/calibration dependencies resolve only from the verified candidate closure and fail closed on missing, tampered, incompatible, or out-of-root inputs.

## 2. Candidate Closure Integration

- [ ] 2.1 Add locked, rebuildable private closure inputs for the profile-update-command-boundary and project-directory-resource-state candidates without changing their public source, Practice, conditions, oracle, semantic/quality assertions, or historical workspace.
- [ ] 2.2 Update candidate snapshots and runtime declarations to cover the new versioned inputs; do not commit installed dependencies, temporary workspaces, logs, or generated output.
- [ ] 2.3 Run both complete private calibration matrices in clean materialized environments and preserve reference/equivalent/anti-pattern semantics.

## 3. Regression Coverage

- [ ] 3.1 Test that both isolated candidate runtimes parse TypeScript with their declared closure and produce healthy v2 evaluator results.
- [ ] 3.2 Test that repository-parent dependencies and global Bun availability do not change evaluator/calibration outcomes.
- [ ] 3.3 Test missing, tampered, and version-mismatched closures fail closed with a redacted runtime failure.
- [ ] 3.4 Test a nonzero evaluator exit cannot be recorded as `evaluated`, and normal semantic/probe failure remains distinct from runtime failure.
- [ ] 3.5 Test public/private isolation for runtime closure staging, materialized public workspace, and diagnostic summaries.

## 4. Verification And Reporting

- [ ] 4.1 Run focused runtime/evaluator/calibration tests and `bun run test:pi:v2` where affected; record outcomes and any justified omission in the PR.
- [ ] 4.2 Run `bun run validate`, OpenSpec strict validation, public/private leakage audit, and `git diff --check`.
- [ ] 4.3 Record #122 conclusion, closure path/version strategy, calibration pass/fail results, verification evidence, unrun items, and residual risks without running Pi, model, retrieval, formal records, or a suite revision.
