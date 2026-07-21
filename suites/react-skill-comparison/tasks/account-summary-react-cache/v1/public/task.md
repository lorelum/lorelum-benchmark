# Build an account summary loader

Implement `loadAccountSummary`. It is used by several server panels during one
render. Equal trimmed account identifiers must share account and permission
work in that render, while a later render reads again. Blank identifiers return
`null`; a missing account must not read permissions; preserve original errors.
Do not add dependencies or change the exported interfaces.
