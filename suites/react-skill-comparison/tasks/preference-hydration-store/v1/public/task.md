# Build a preference hydration store

Implement `createPreferenceStore`. It lazily reads one persisted preference
record for colour scheme and compact layout. Storage may be unavailable. Invalid
records and invalid external values leave defaults unchanged. Consumers can
subscribe and release safely; local updates write a canonical record exactly
once when state changes. Do not add dependencies.
