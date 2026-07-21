# Build a project summary reader

Implement `readProjectSummary` in `src/project-summary.ts`.

- An anonymous viewer may receive an approved project's public summary, public
  work items, and its public item count.
- A member viewer with a nonempty `organisationId` may receive the requested
  organisation's complete project view, including internal items, internal
  note, and the complete item count.
- A missing project, unapproved public project, viewer from another
  organisation, or malformed viewer returns `null`.
- Validate the viewer before using the repository. Use the repository method
  appropriate to the viewer's access level; do not obtain a more privileged
  project merely to build a restricted response.
- Preserve the exported interfaces and do not add dependencies.
