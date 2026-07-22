# Build a preference hydration store

Implement `createPreferenceStore`. It lazily reads one persisted preference
record for colour scheme and compact layout. Storage may be unavailable. Until a
relevant external-change event arrives, repeated reads use that cached record.
After one arrives, the next read refreshes storage once; invalid, unrelated, or
equivalent values do not notify consumers. Consumers release safely; local
updates write one canonical record and notify once when state changes. Do not
add dependencies.
