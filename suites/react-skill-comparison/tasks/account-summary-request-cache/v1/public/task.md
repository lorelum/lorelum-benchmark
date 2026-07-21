# Build an account summary request context

Implement `createAccountSummaryContext` in `src/account-summary.ts`. A context
is created for one request and may be used by several cards that ask for an
account summary.

- Blank account identifiers return `null` without contacting the repository.
- Equivalent nonblank identifiers within the same context must observe one
  account summary while a read is pending and after it has completed.
- A different context represents a different request and must obtain its own
  result.
- Missing accounts return `null` without requesting permissions.
- Failed repository reads may be retried in the same context. Preserve the
  exported interfaces, result shape, and original errors. Do not add
  dependencies.
