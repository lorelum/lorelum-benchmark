#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <completed-workspace>" >&2
  exit 2
fi

workspace=$1
task_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
repository=$(git -C "$task_directory" rev-parse --show-toplevel)
candidate="$workspace/src/practice.ts"

if [[ ! -f $candidate ]]; then
  echo "Candidate file not found: $candidate" >&2
  exit 2
fi

cd "$repository"
CANDIDATE_PATH="$candidate" bun run test:format-frontmatter
