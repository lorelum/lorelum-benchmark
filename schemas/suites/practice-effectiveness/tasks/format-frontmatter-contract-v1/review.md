# Freeze Review: `format-frontmatter-contract-v1`

## Claim

Injecting `lorelum.format.validation-boundary` helps an agent turn untrusted
Practice metadata into either a fully trusted model or accumulated typed errors.

## Review before freezing

- [ ] `task.md` does not name required metadata fields, issue codes, or the
  unknown-key policy.
- [ ] `evaluator/` is excluded from every coding-agent workspace.
- [ ] `oracle.yaml` and `negative.yaml` are excluded from baseline workspaces.
- [ ] The unrelated control has comparable injected length after formatting.
- [ ] A reviewer independently agrees the relevant Practice is applicable.
- [ ] The starter and evaluator commands pass with a known-good reference
  implementation and fail with the TODO starter.
- [ ] Model, prompt, tools, and budgets are recorded before any run.

The task has content approval, but remains `approved-pending-commit` until its
starter, evaluator, and injected Practice files exist at the immutable baseline
commit. Only then may a reviewer set `task.yaml.status` to `frozen` and start
Phase A runs.
