# Update the local publication check

Before a local guidance bundle is published, its decision configuration must
not point users to entries that are unavailable in the bundle. Update
`src/publication-check.ts` so the publication result blocks invalid
configuration and reports actionable feedback to the caller.

Preserve the exported interfaces. Do not add dependencies or perform file,
network, or clock-based operations.
