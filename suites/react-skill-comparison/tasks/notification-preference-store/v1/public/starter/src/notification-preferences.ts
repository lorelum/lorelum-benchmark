export type Theme = "system" | "light" | "dark";

export interface NotificationPreferences {
  version: 2;
  theme: Theme;
  dismissedNoticeIds: string[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StorageChange {
  key: string | null;
  newValue: string | null;
}

export interface StorageEventSource {
  addEventListener(type: "storage", listener: (event: StorageChange) => void): void;
  removeEventListener(type: "storage", listener: (event: StorageChange) => void): void;
}

export interface NotificationPreferenceStore {
  get(): NotificationPreferences;
  setTheme(theme: Theme): void;
  dismissNotice(noticeId: string): void;
  subscribe(listener: (preferences: NotificationPreferences) => void): () => void;
  dispose(): void;
}

export const notificationPreferenceStorageKey = "notification-preferences";

export function createNotificationPreferenceStore(
  storage: StorageLike,
  events: StorageEventSource,
): NotificationPreferenceStore {
  let preferences = JSON.parse(storage.getItem(notificationPreferenceStorageKey) ?? "null") as NotificationPreferences;
  const listeners = new Set<(preferences: NotificationPreferences) => void>();

  return {
    get() {
      return preferences;
    },
    setTheme(theme) {
      preferences = { ...preferences, theme };
      storage.setItem(notificationPreferenceStorageKey, JSON.stringify(preferences));
      for (const listener of listeners) listener(preferences);
    },
    dismissNotice(noticeId) {
      preferences = {
        ...preferences,
        dismissedNoticeIds: [...preferences.dismissedNoticeIds, noticeId],
      };
      storage.setItem(notificationPreferenceStorageKey, JSON.stringify(preferences));
      for (const listener of listeners) listener(preferences);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {},
  };
}
