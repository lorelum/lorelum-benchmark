# Build a member workspace loader

Implement `loadMemberHub` for a member identifier whose `trim()` result is
nonempty. Inputs such as `""` and `"   "` are blank: return `null` and perform
no repository reads for them. Return the member profile, organisation,
organisation projects, and pending reviews for a non-blank identifier.

Profile and organisation reads are independent and must begin in parallel.
When the organisation becomes available, project and review reads must start
without waiting for an unrelated profile read. Preserve the original error
object from any repository read. Do not add dependencies or change exported
interfaces.
