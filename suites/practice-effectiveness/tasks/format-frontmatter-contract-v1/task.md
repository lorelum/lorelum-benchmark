# Validate a Practice metadata object

Pack files are authored outside the running process and may contain malformed
metadata. Complete `parsePracticeMetadata` in `src/practice.ts` so callers get
either a trusted metadata object or a structured validation failure they can
show to a pack author.

Keep the exported types and function signature unchanged. Do not add
dependencies, change the package scripts, or modify tests. The task is limited
to the metadata parser; do not add retrieval, filesystem, or CLI behavior.

Run the visible type check before you finish. Report files changed and any
assumptions.
