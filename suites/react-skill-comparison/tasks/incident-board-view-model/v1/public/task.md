# Build an incident board view model

Implement `createIncidentBoard`. It filters immutable incidents and exposes rows
with selection and callbacks. Filtering preserves input order; selecting an
absent incident clears selection. Replacing one incident must not mutate input
records or disturb unaffected visible rows and callbacks. Do not add dependencies.

Expose `getDerivationCount()` so callers can observe row derivations.
