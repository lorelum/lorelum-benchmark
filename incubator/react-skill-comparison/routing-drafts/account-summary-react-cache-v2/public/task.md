# Build an account workspace

Implement a server account workspace used by several panels in one render.
Equal trimmed account identifiers share account and permission reads during that
render. A later render starts fresh reads. Blank identifiers return `null`; a
missing account never reads permissions; preserve repository errors.
