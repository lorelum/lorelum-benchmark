## 1. OpenSpec and planning gate

- [ ] 1.1 Strictly validate this change and create the initial PR containing only OpenSpec artifacts, linked to #149. (`openspec validate candidate-scoring-fairness --type change --strict`)

## 2. Implement

- [ ] 2.1 Add the scoring-fairness requirement to `openspec/specs/practice-benchmark-boundaries/spec.md`.
- [ ] 2.2 Amend `openspec/specs/login-page-task-headroom/spec.md`: replace the "task MUST NOT include layering hints" clause with "task MUST state the basic measured-behavior requirement; detailed convention comes from the Practice".
- [ ] 2.3 Sync the change spec and run `bun run validate` + OpenSpec strict validation + `git diff --check`.
