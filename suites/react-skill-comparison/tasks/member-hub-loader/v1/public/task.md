# Build a member hub loader

Implement `loadMemberHub` in `src/member-hub.ts`. It builds the member hub for
a member identifier using the supplied repository.

- A blank member identifier returns `null` and must not call the repository.
- The result contains the member profile, organisation, projects, pending
  reviews, and either activity records or `null`.
- Projects and pending reviews require the organisation. Activity requires the
  project list and is requested only when `includeActivity` is true.
- Preserve the exported interfaces, result shape, and original repository
  errors. Do not add dependencies.

The implementation should avoid making a caller wait for work that does not
need a prior result.
