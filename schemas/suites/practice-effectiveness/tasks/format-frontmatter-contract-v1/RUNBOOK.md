# Runbook: `format-frontmatter-contract-v1`

This card is not runnable until its human review and immutable Git snapshot are complete. The
commands below describe the post-freeze procedure so every condition receives
the same starter and only the intended injected content differs.

## Prepare one condition

Create one fresh workspace per condition. Do not create sibling condition
directories inside the coding agent's visible filesystem. After the task is
frozen, use `scripts/prepare-condition.sh` rather than copying files manually.

```bash
task_root=/home/theleeying/lorelum-benchmark/schemas/suites/practice-effectiveness/tasks/format-frontmatter-contract-v1
workspace=/tmp/format-frontmatter-baseline

test ! -e "$workspace"
mkdir -p "$workspace"
cp -R "$task_root/starter/." "$workspace"
cp "$task_root/task.md" "$workspace/TASK.md"
```

For the Oracle condition, add only
`practices/lorelum-core/format/validation-boundary.md` as `ORACLE.md`. For the
irrelevant-Practice condition, add only
`practices/lorelum-core/retrieval/ranking-explanation.md` as `ORACLE.md`. The
baseline gets neither file. Do not copy `evaluator/`, `oracle.yaml`,
`negative.yaml`, or `review.md` into a coding workspace.

Install dependencies before network isolation:

```bash
cd "$workspace"
bun install --frozen-lockfile
bun run typecheck
```

## Isolation and evaluation

Launch the coding agent in a container or sandbox that mounts only
`$workspace`, disables network access, and uses the same model configuration,
system prompt, tools, and budget for every condition. After the agent stops,
store its transcript and source diff outside the workspace.

The evaluator runs outside the coding workspace and receives only the candidate
file path. Use `scripts/evaluate-condition.sh` after the coding agent stops:

```bash
CANDIDATE_PATH="$workspace/src/practice.ts" \
  bun run test:format-frontmatter
```

## Run record minimum

Write one JSONL object per execution using
`schemas/run-record.schema.json`. Add the task source kind in the diff path or
run artifact name, retain the injected-content hash for Oracle/control runs,
and set `blind_review` to `pending` until a reviewer receives randomized output.
