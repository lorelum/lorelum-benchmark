# Practice Effectiveness Suite

This suite evaluates whether a relevant Practice improves a bounded coding
result. Its runner accepts only task cards with `status: frozen`.

Lorelum is early enough that historical issues and regressions do not yet form
a representative task pool. Until they do, `candidates/` contains
contract-derived seed tasks: each is traced to a frozen public product contract,
not reverse-designed from a Practice. A candidate becomes runnable only after
an independent reviewer freezes its prompt, acceptance oracle, relevant
Practice, and comparable irrelevant-Practice control.

The seed phase is evidence about contract-derived implementation work, not a
claim about production-task performance. Replace seed tasks with real Lorelum
tasks as the project accumulates issues, PRs, and regressions.

See `sources.yaml` for the frozen source set and
`IMPLEMENTATION_PLAN.md` for the candidate-to-run workflow.
