# Verification

## Rule-source review (2026-09-13)

This review covered the committed sources that direct repository work: root `AGENTS.md`, `CONTRIBUTING.md`, `docs/BENCHMARK_PROTOCOL.md`, `docs/TASK_LIFECYCLE.md`, `docs/WORKSPACE_LAYOUT.md`, `docs/PI_RUNNER.md`, `docs/FORMAL_SANDBOX.md`, `docs/FORMAL_SMOKE.md`, `openspec/specs/openspec-pr-continuity/spec.md`, `.github/workflows/validate.yml`, and `src/benchmark/validate.ts`.

| Source | Review result | Change in this PR |
| --- | --- | --- |
| `AGENTS.md` | The core isolation, lifecycle, validation, direct-fix, local-smoke, Issue/OpenSpec, PR-continuity, and formal-execution gates remain necessary. The planning wording was broader than its actual decision purpose, and there was no freshness or feedback mechanism. | Add a visible actual-review date, an event-driven closeout result, and decision-scoped planning confirmation. |
| `CONTRIBUTING.md` | Its fixture checklist could be read as a standalone route because it began at directory creation. | State that applicable repository process is a precondition, not an alternative. |
| `docs/BENCHMARK_PROTOCOL.md`, `docs/TASK_LIFECYCLE.md`, `docs/WORKSPACE_LAYOUT.md` | The public/private boundary, task immutability, snapshots, records, and lifecycle requirements agree with the root rules for this scope. | No change. |
| `docs/PI_RUNNER.md`, `docs/FORMAL_SANDBOX.md`, `docs/FORMAL_SMOKE.md` | Formal execution remains separately fail-closed and out of scope for a documentation/process change. | No change. |
| `openspec-pr-continuity` | The generated `TBD` purpose was stale. Its planning requirement needed to distinguish a new/changed experimental decision from implementation that reuses a recorded decision. | Replace the purpose, add the lightweight rule-review requirement, and clarify the planning requirement. |
| `.github/workflows/validate.yml` and `src/benchmark/validate.ts` | CI runs workspace validation, contract tests, image checks, and realistic-repository checks. The validator checks schema/layout plus named public/private and generated-output paths; neither mechanism substitutes for Issue/OpenSpec planning or human applicability review. | No change; the documentation keeps this distinction explicit. |
| committed Skills | `git ls-files .agents .codex` returned no committed repository Skills. Local or user-installed Skills therefore are not treated as repository policy by this change. | No change. |

Other stable OpenSpec specs with generated `Purpose: TBD` text were not bulk-edited. Their individual intent needs source-specific review; inventing purposes here would be the same kind of ungrounded rule expansion this change avoids.

## Historical and counterexample replay

| Case | Applicability under the clarified rules | Result |
| --- | --- | --- |
| #74 `practice-login-page-oracle-probe` | The historical ordering reversal remains the explicitly documented one-time exception. It does not provide a path for current work to bypass Issue-before-OpenSpec. | Existing guard retained; no retrospective rewrite. |
| #145 login task revision | The change altered candidate behavior, treatment delivery, evaluation, source identity, and future result interpretation. Planning confirmation applies. | The new wording preserves the gate. |
| #192 v4 directional screen | The frozen candidate, treatment, and snapshot were reused, but the block plan and four-value interpretation were new experimental decisions. Planning confirmation applies to those decisions; candidate decisions can be cited rather than re-opened. | Matches its #192 issue and OpenSpec design/verification without treating reuse as an exception. |
| PR #183 local Pi runner repair | The change stated that only the local profile diagnostic runner changed and that formal runner, environment, sandbox/proxy, record, candidate/snapshot, and conclusion semantics remained unchanged. | The direct-fix path applies; focused tests and `bun run validate` were appropriate without reopening experimental design. |
| User-authorized local smoke | A local test/diagnostic may run without an Issue, but cannot create a formal record, revision upgrade, or formal conclusion. If it surfaces a shared-rule ambiguity, the existing work record receives the concise review outcome. | Existing boundary retained; no automatic escalation to a benchmark change. |

## Validation

- `openspec validate --specs --strict --json`: 40 stable specs valid (pre-existing long-requirement INFO notices only).
- `openspec validate rule-freshness-maintenance --type change --strict --json` before archive.
- `openspec archive rule-freshness-maintenance -y`: archived successfully as `2026-09-13-rule-freshness-maintenance` and applied the approved stable-spec delta.
- `git diff --check`
- Manual diff review confirmed that only `AGENTS.md`, `CONTRIBUTING.md`, the stable continuity spec, and this change's OpenSpec artifacts changed. No task, suite, schema, evaluator, runner, treatment, environment, record, private material, snapshot, or generated artifact changed.
- `bun run validate` was not required or run: this change does not modify a suite, task, schema, or benchmark code.
