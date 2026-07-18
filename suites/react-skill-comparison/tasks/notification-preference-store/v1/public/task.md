# Harden persisted notification preferences

Notification preferences are stored locally and synchronized across browser
tabs. Existing persisted values include malformed JSON and an older shape, and
the current store neither validates data nor cleans up event listeners.

Update `src/notification-preferences.ts` while preserving its exported
interfaces.

- Treat malformed or invalid stored values as defaults without throwing.
- Accept the legacy `dismissedIds` field, normalize it to
  `dismissedNoticeIds`, and keep only unique strings.
- Persist only normalized version 2 data after mutations.
- React only to valid changes for the configured storage key.
- Subscriptions and `dispose` must release listeners correctly. Do not add
  dependencies.
