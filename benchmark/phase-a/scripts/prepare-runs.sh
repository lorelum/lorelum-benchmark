#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <new-run-directory>" >&2
  exit 2
fi

run_directory=$1
if [[ -e "$run_directory" ]]; then
  echo "Refusing to reuse existing run directory: $run_directory" >&2
  exit 2
fi

script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
phase_directory=$(cd -- "$script_directory/.." && pwd)

mkdir -p "$run_directory"

for condition in baseline oracle; do
  workspace="$run_directory/$condition"
  cp -R "$phase_directory/starter" "$workspace"
  cp "$phase_directory/TASK.md" "$workspace/TASK.md"

  if [[ $condition == oracle ]]; then
    cp "$phase_directory/../../react-fullstack/practices/auth/single-flight-token-refresh.md" \
      "$workspace/ORACLE.md"
  fi
done

echo "Prepared: $run_directory/baseline"
echo "Prepared: $run_directory/oracle"
echo "Install dependencies in both workspaces before launching the two fresh conversations."
