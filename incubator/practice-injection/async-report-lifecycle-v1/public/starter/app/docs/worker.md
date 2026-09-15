# Worker CLI

The worker is a separate process from the HTTP server and operates on the same `.data/reports/` directory.

```text
bun run src/worker.ts --report <id> --step
bun run src/worker.ts --report <id> --retry
bun run src/worker.ts --report <id> --step --fail-at-segment <n>
```

Each report has three segments. One `--step` advances at most one segment. A pause request is applied at the next checkpoint, not in the middle of the current segment. `--retry` resumes a failed report from its last persisted checkpoint. `--fail-at-segment` is deterministic and is intended for local verification; it is not a production retry policy.

The command prints a redacted JSON result. Errors use stable codes and do not include raw state contents, internal paths, or stack traces.
