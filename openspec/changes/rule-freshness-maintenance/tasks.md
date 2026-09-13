# Tasks

## 1. OpenSpec and initial PR

- [x] 1.1 Create the #195 OpenSpec artifacts, pass `openspec validate rule-freshness-maintenance --type change --strict --json`, and open the required same-branch initial PR containing only these artifacts (write scope: `openspec/changes/rule-freshness-maintenance/`).

## 2. Current-rule maintenance

- [ ] 2.1 Add the event-driven `规则最近核对` signal and the concise task-close rule outcome to `AGENTS.md`; clarify planning confirmation and retain its existing hard gates (write scope: `AGENTS.md`).
- [ ] 2.2 State the applicable repository-process precondition in `CONTRIBUTING.md` and replace the `openspec-pr-continuity` purpose placeholder / planning requirement with the approved current wording (write scope: `CONTRIBUTING.md`, `openspec/specs/openspec-pr-continuity/spec.md`).

## 3. Review and validation

- [ ] 3.1 Record the review of `AGENTS.md`, contributor guidance, core protocol/lifecycle/layout docs, stable continuity spec, committed Skills status, and CI/validator boundary; replay #74, #145, #192, a direct runner fix, and local smoke as applicable/not-applicable cases (write scope: `openspec/changes/rule-freshness-maintenance/verification.md`).
- [ ] 3.2 Run OpenSpec strict validation and `git diff --check`; inspect the final diff for accidental benchmark-semantic, task, snapshot, record, or private-material changes; record the #195 rule-review outcome in the Issue and PR.
