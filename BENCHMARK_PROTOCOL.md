# Benchmark Protocol

This repository hosts reproducible coding tasks for two related, but distinct,
questions:

| Track | Question | Required conditions |
| --- | --- | --- |
| `practice-effectiveness` | Does a relevant team Practice improve a coding result? | baseline, Oracle Practice, Lorelum retrieval, irrelevant Practice |
| `performance-skill-comparison` | Does Lorelum retrieval match or improve on Vercel's React Skill at comparable coverage? | baseline, Vercel Skill, Lorelum retrieval |

The tracks share task cards, evaluators, run records, and review procedures.
They do not share a conclusion: an external performance Skill cannot prove that
team-specific Practice retrieval works, and an Oracle-Practice experiment does
not establish parity with Vercel's Skill.

## Conditions

- `baseline` (`G0`): no injected Practice, Vercel Skill, or Lorelum query.
- `oracle-practice`: the reviewer-selected relevant Practice content is
  injected. This isolates the value of the content and injection format.
- `lorelum-retrieval` (`G2`): Lorelum selects and returns the Practice content.
  It measures the complete product path and remains deferred until the CLI is
  usable.
- `irrelevant-practice`: an intentionally unrelated Practice of comparable
  length is injected. This controls for extra context rather than relevance.
- `vercel-skill` (`G1`): Vercel's pinned React Skill is enabled. It applies only
  to the external performance comparison track.

Every compared run uses the same task revision, initial code, model and model
version, system prompt, tool permissions, token/time budget, and clean working
directory. The condition is the only intended difference.

## Task Card Contract

Each task directory contains:

```text
task-id/
  task.yaml       # stable metadata and applicable conditions
  task.md         # task prompt visible to the coding agent
  starter/        # initial code copied to a clean run workspace
  evaluator/      # automated checks run after the agent finishes
  oracle.yaml     # evaluator-only expected knowledge and scoring assertions
```

The runner must never copy `oracle.yaml` into the coding agent's workspace.
The task prompt must describe the desired product behavior, not name or quote
the expected Practice.

`practice-effectiveness` pilot tasks must have one or two independently
reviewed Oracle Practices and an acceptance check that can distinguish a
working-but-noncompliant result from a compliant result. Tasks with no
reproducible checks, leaked answers, or unavoidable external dependencies are
not eligible.

## Dataset Growth

When Lorelum has a representative issue, PR, or regression history, maintain a
candidate pool of real Lorelum tasks, then freeze six pilot cards before
expanding to 8–12 formal Practice-effectiveness tasks. The performance track
begins with eight category smoke tasks and expands only when
`coverage-manifest.yaml` maps every external baseline rule to at least one task.

Before that history exists, the Practice-effectiveness suite may use a
**contract-derived seed phase**. Each seed task must cite an immutable product
or pack contract, be authored without quoting its eventual Practice, and be
labeled `contract-derived-seed` in its task card and all run records. Seed
results support only the contract-derived implementation claim; they do not
substitute for production-task evidence. Replace seed tasks with real Lorelum
tasks as the project accumulates representative work.

Changing a prompt, starter code, evaluator, Oracle mapping, or model setup
creates a new task or suite revision. Existing run records are immutable.

## Run Records

One JSONL object represents one task execution. It must validate against
`schemas/run-record.schema.json` and include the suite/task revisions,
condition, model configuration, source commit, retrieval trace when present,
cost/latency, code diff location, automated checks, and blind-review result.
This lets both tasks consume the same dataset without overwriting each other's
evidence.
