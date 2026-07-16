#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <completed-workspace>" >&2
  exit 2
fi

workspace=$1
if [[ ! -f "$workspace/src/auth/protectedRequest.ts" ]]; then
  echo "Not a Phase A workspace: $workspace" >&2
  exit 2
fi

if [[ -e "$workspace/src/auth/protectedRequest.test.ts" ]]; then
  echo "Refusing to overwrite an existing evaluator test file." >&2
  exit 2
fi

script_directory=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
phase_directory=$(cd -- "$script_directory/.." && pwd)

cp "$phase_directory/checks/protectedRequest.test.ts" \
  "$workspace/src/auth/protectedRequest.test.ts"

(
  cd "$workspace"
  bun test
)
