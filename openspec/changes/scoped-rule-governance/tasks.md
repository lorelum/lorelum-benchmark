## 1. OpenSpec contract and evidence chain

- [ ] 1.1 Update Issue #195 to the scoped-rule-governance problem, acceptance criteria, and non-goals; close Draft PR #203 as superseded without merging its archived rule-freshness change.
- [ ] 1.2 Create this change's proposal, design, delta specs, and tasks; strict-validate them and create the initial OpenSpec-only PR referencing #195.
- [ ] 1.3 After initial PR creation, present the Plan-mode implementation plan and record requester confirmation before non-OpenSpec edits.

## 2. Rule-scope migration

- [ ] 2.1 Converge `AGENTS.md`: add the actual root-rule review date; retain universal invariants/routing; remove #74 history, Practice-effectiveness checklist, and treatment delivery details; add applicability and stable-promotion boundaries.
- [ ] 2.2 Move the complete `practice-card` and `project-convention/v1` delivery contract into `treatments/README.md` without weakening public/private or condition-scoped isolation.
- [ ] 2.3 Update `openspec-pr-continuity` Purpose and apply its generic continuity, Plan-mode/applicability, and stable-promotion delta requirements.
- [ ] 2.4 Update `practice-benchmark-boundaries` Purpose and apply the declared-Practice-effectiveness control-design requirement.
- [ ] 2.5 Archive the change after its stable-spec deltas are complete, then remove the empty `practice-candidate-expansion` stable capability while preserving its archive source.

## 3. CI purpose guard

- [ ] 3.1 Pin `@fission-ai/openspec@1.3.1` in devDependencies and lockfile; expose a local `validate:openspec` command.
- [ ] 3.2 Add a cross-platform Bun purpose-guard script that receives a base Git revision and checks only added/modified stable spec files for a nonempty, non-placeholder Purpose.
- [ ] 3.3 Add tests for no changed spec, valid changed Purpose, and changed placeholder Purpose.
- [ ] 3.4 Add an OpenSpec governance CI job that runs strict validation on push/PR and purpose tests/guard on PR without changing existing benchmark workspace jobs.

## 4. Verification

- [ ] 4.1 Run focused purpose-guard tests, `bun run validate:openspec`, `openspec validate scoped-rule-governance --type change --strict --json`, and `git diff --check`.
- [ ] 4.2 Verify final scope counterexamples: direct runner/validation/process repair; authorized local smoke; declared Practice-effectiveness change; frozen candidate directional screen.
- [ ] 4.3 Verify root `AGENTS.md` no longer contains #74, the global Practice-control checklist, or delivery-form details; verify no active reference or stable file remains for `practice-candidate-expansion`.
- [ ] 4.4 Run final `openspec validate --all --strict --json`; record that no suite/task/schema/benchmark-code change or model execution occurred.
