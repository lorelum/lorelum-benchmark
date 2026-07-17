#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <baseline|oracle-practice|irrelevant-practice> <new-workspace>" >&2
  exit 2
fi

condition=$1
workspace=$2
task_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
repository=$(git -C "$task_directory" rev-parse --show-toplevel)

bash "$task_directory/scripts/freeze-check.sh"

if [[ -e $workspace ]]; then
  echo "Refusing to reuse workspace: $workspace" >&2
  exit 2
fi

mkdir -p "$workspace"
cp -R "$task_directory/starter/." "$workspace"
cp "$task_directory/task.md" "$workspace/TASK.md"

case $condition in
  baseline) ;;
  oracle-practice)
    cp "$repository/practices/lorelum-core/format/validation-boundary.md" "$workspace/ORACLE.md"
    ;;
  irrelevant-practice)
    cp "$repository/practices/lorelum-core/retrieval/ranking-explanation.md" "$workspace/ORACLE.md"
    ;;
  *)
    echo "Unknown condition: $condition" >&2
    exit 2
    ;;
esac

(
  cd "$workspace"
  bun install --frozen-lockfile
  bun run typecheck
)

echo "Prepared $condition workspace: $workspace"
