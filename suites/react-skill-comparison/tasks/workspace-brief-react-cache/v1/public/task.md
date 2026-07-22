# Build a workspace brief loader

Implement `createWorkspaceBriefLoader`. Several server panels use one returned
loader during a render. A blank or whitespace-only workspace identifier returns
`null` and performs no reads. A non-blank brief contains the workspace, its
quota, and summaries of its pinned projects.

Equal trimmed workspace identifiers requested by panels in one server render
must share in-flight repository work. A later server render starts new work.
For a non-blank identifier, workspace and quota reads are independent and must
start together. After the workspace becomes available, pinned-project and
summary reads must start without waiting for an unrelated quota read. A missing
workspace returns `null` and must not read pinned projects. Preserve original
repository errors, do not add dependencies, and do not change exported
interfaces.
