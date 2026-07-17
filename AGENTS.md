# Benchmark Workspace Rules

- Keep reusable contracts in `schemas/`, benchmark fixtures in `suites/`, and
  runner or validation code in `src/benchmark/`.
- A task revision lives at `suites/<suite>/tasks/<task-slug>/v<version>/`.
  Do not modify a revision after it has recorded results; create the next
  revision instead.
- Keep the formal source and snapshot of every revision in the repository.
  Retire historical revisions by removing them from the default active set;
  do not create a second mutable archive copy.
- Shared evaluator helpers are versioned under `src/benchmark/`; never rewrite a
  helper version used by a frozen task.
- Agent-visible files belong in `public/`. Evaluators, oracle material, and
  scoring configuration belong in `private/` and must never be copied into an
  agent workspace.
- Never commit `node_modules/`, run workspaces, logs, or generated diffs.
  Commit dependency manifests and lockfiles needed to reconstruct a starter.
- Run `bun run validate` after changing a suite, task, schema, or benchmark code.
