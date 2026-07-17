# Freeze Review: `anti-pattern-registry-integrity-v1`

## Claim

Injecting `lorelum.format.cross-reference-integrity` helps an agent implement
complete, deterministic diagnostics for global registry and Practice-reference
integrity.

## Review before freezing

- [ ] `task.md` does not name the two-pass algorithm, exact issue codes, or
  diagnostic sort order.
- [ ] `evaluator/` is excluded from every coding-agent workspace.
- [ ] `oracle.yaml` and `negative.yaml` are excluded from baseline workspaces.
- [ ] The unrelated control has comparable injected length after formatting.
- [ ] A reviewer independently agrees the relevant Practice is applicable and
  the negative control is unrelated.
- [ ] The reference implementation passes the evaluator and the TODO starter
  fails it.
- [ ] Model, prompt, tools, and budgets are recorded before any run.

This task is `review-required`. After all checks are approved, make an
immutable commit containing the task, set `baseline_commit` to that commit,
change `task.yaml.status` to `frozen`, and run `scripts/freeze-check.sh` before
each condition.
