## 0. Planning Clarification Gate

- [ ] 0.1 After strict validation and initial PR creation, confirm with the
  requestor that the observable behavior is isolation-audit-only; Practice,
  task behavior, baseline treatment, candidate source, semantic/quality oracle,
  starter, model, prompt, budget, and blind-review boundaries remain unchanged.
- [ ] 0.2 Record the confirmation on issue #104 and in this design before
  modifying benchmark code.

## 1. Core Isolation Behavior

- [ ] 1.1 Extend the `core/v1` isolation input and kernel CLI so the audit can
  compare calibration files against the candidate's independent public source.
- [ ] 1.2 Exempt only byte-identical regular files below `private/calibration/`
  from the content-hash set, while retaining all path and sensitive-name checks.
- [ ] 1.3 Preserve fail-closed hash behavior when public-source roots are absent
  and for every non-calibration private file.

## 2. Regression Evidence

- [ ] 2.1 Add a focused test showing a calibration-bearing candidate passes when
  its workspace contains only public source.
- [ ] 2.2 Add focused tests showing copied private Practice, conditions, oracle,
  or evaluator content still fails, including the neutral fixture's real leak.
- [ ] 2.3 Run the focused kernel isolation tests and `bun run validate`; record
  evidence in the PR without running Pi, model, retrieval, or formal records.
