## 1. Plan-before-implementation gate

- [ ] 1.1 In `AGENTS.md`, add a concise universal gate requiring an OpenSpec-ready change to enter Plan mode (or its visible equivalent), present the minimum implementation plan, and obtain explicit requester confirmation before any non-OpenSpec implementation.
- [ ] 1.2 In `openspec/specs/openspec-pr-continuity/spec.md`, add the stable requirement and scenarios for the gate, including the narrow pre-confirmation allowance and re-confirmation on material plan changes.
- [ ] 1.3 Confirm the root instruction and stable specification use the same trigger, minimum plan content, confirmation condition, and material-change boundary without adding a registry or routine report.

## 2. Validation and evidence

- [ ] 2.1 Re-run `openspec validate plan-before-implementation --type change --strict --json` after the implementation and keep the initial PR as the sole evidence chain.
- [ ] 2.2 Run `openspec validate --all --strict --json` and `git diff --check`; document that `bun run validate` is not required because no suite, task, schema, or benchmark code changes.
- [ ] 2.3 Verify the scenarios manually: OpenSpec drafting/read-only investigation remains allowed; unconfirmed implementation is blocked; confirmed implementation may proceed; a material scope or applicability change re-enters planning.
