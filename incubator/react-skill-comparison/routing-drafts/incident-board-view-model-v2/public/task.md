# Build an incident board view model

Implement an incident board from immutable incidents, a status filter, and a
selected identifier. Replacing one incident must preserve unrelated visible row
and callback identities while deriving changed rows correctly. Filter changes
clear invisible selection. Expose a derivation count without mutating input.
