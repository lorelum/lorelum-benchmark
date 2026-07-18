# Coordinate a workspace overview loader

The workspace overview combines data with different dependency relationships.
The current implementation is functionally correct but serializes requests
that do not depend on one another.

Update `src/workspace-overview.ts` to minimize avoidable waiting while
preserving the exported interfaces and result shape.

- Empty or whitespace-only workspace IDs return `null` without calling the API.
- Viewer and workspace lookups are independent.
- Projects, members, and the optional audit feed depend on the workspace, but
  are independent of one another once it is available.
- Do not request audit events when `includeAudit` is false.
- Preserve original API errors and do not add dependencies.
