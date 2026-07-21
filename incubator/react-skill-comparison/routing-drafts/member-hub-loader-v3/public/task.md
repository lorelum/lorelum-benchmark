# Build a member workspace loader

Implement `loadMemberWorkspace` for a non-blank member identifier. Return the
member profile, organisation, organisation projects, and pending reviews.
Profile and organisation reads are independent. When the organisation becomes
available, project and review reads must start without waiting for an unrelated
profile read. Blank input performs no reads; preserve original repository errors.
