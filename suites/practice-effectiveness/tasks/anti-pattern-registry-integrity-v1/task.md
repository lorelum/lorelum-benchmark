# Validate pack references before indexing

A pack contains a central registry and several Practice files that point to
entries in that registry. Complete `validatePackIntegrity` in
`src/pack-integrity.ts` so indexing proceeds only when the pack's references
are internally consistent. When it is not consistent, callers need structured
diagnostics suitable for a pack author.

Keep the exported API unchanged. Do not add dependencies, alter package scripts,
or modify tests. Restrict the change to pack-integrity validation.

Run `bun run typecheck` before finishing and report changed files and
assumptions.
