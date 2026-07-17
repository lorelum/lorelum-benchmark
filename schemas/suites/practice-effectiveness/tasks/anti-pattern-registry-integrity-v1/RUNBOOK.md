# Runbook: `anti-pattern-registry-integrity-v1`

This card is not runnable until human review and an immutable Git snapshot are
complete. Each condition gets a fresh workspace containing the same starter and
task prompt; only the injected Practice differs.

## Prepare one condition

```bash
task_root=/home/theleeying/lorelum-benchmark/schemas/suites/practice-effectiveness/tasks/anti-pattern-registry-integrity-v1
workspace=/tmp/anti-pattern-registry-baseline

bash "$task_root/scripts/prepare-condition.sh" baseline "$workspace"
```

Use `oracle-practice` to add only
`practices/lorelum-core/format/cross-reference-integrity.md` as `ORACLE.md`.
Use `irrelevant-practice` to add only
`practices/lorelum-core/retrieval/ranking-explanation.md` as `ORACLE.md`.
The baseline receives neither file. Never give a coding agent `evaluator/`,
`oracle.yaml`, `negative.yaml`, or `review.md`.

## Run and evaluate

Run each coding agent with the same frozen model/version, system prompt, tools,
budget, and initial user prompt. Store its transcript and source diff outside
the workspace. Evaluate only after the agent stops:

```bash
bash "$task_root/scripts/evaluate-condition.sh" "$workspace"
```

Record one run object per condition using
`schemas/run-record.schema.json`. This is a contract-derived seed task, so
report any result as evidence about this contract class—not as production-task
evidence.
