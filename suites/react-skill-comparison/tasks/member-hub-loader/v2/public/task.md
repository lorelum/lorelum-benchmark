# Build a member hub loader

Implement `loadMemberHub` in `src/member-hub.ts` using the supplied repository.

- A blank member identifier returns `null` and must not call the repository.
- Return the member profile, organisation, organisation projects, and pending
  reviews in the declared result shape.
- Projects and reviews are available only after the organisation is known.
- Preserve the exported interfaces and original repository errors. Do not add
  dependencies.

The implementation should not make the caller wait for work that does not need
a prior result.
