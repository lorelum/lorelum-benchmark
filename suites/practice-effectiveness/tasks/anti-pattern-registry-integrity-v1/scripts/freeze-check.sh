#!/usr/bin/env bash
set -euo pipefail

task_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
repository=$(git -C "$task_directory" rev-parse --show-toplevel)
task_relative=${task_directory#"$repository/"}
status=$(sed -n 's/^status: //p' "$task_directory/task.yaml")
baseline_commit=$(sed -n 's/^  baseline_commit: //p' "$task_directory/task.yaml")

if [[ $status != frozen ]]; then
  echo "Task status is '$status'; expected 'frozen'." >&2
  exit 2
fi

git -C "$repository" rev-parse --verify --quiet "$baseline_commit^{commit}" >/dev/null

for path in \
  "$task_relative/task.yaml" \
  "$task_relative/task.md" \
  "$task_relative/starter/package.json" \
  "$task_relative/starter/bun.lock" \
  "$task_relative/starter/src/pack-integrity.ts" \
  "$task_relative/evaluator/pack-integrity.test.ts" \
  "practices/lorelum-core/format/cross-reference-integrity.md" \
  "practices/lorelum-core/retrieval/ranking-explanation.md"; do
  git -C "$repository" cat-file -e "$baseline_commit:$path"
done

echo "Frozen task snapshot verified: $baseline_commit"
