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

export const notificationPreferenceStorageKey = "notification-preferences";
const defaultPreferences: NotificationPreferences = { version: 2, theme: "system", dismissedNoticeIds: [] };

function normalize(value: unknown): NotificationPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if ("version" in record && record.version !== 2) return null;
  const theme = record.theme ?? "system";
  if (theme !== "system" && theme !== "light" && theme !== "dark") return null;
  const ids = record.dismissedNoticeIds ?? record.dismissedIds ?? [];
  if (!Array.isArray(ids)) return null;
  return {
    version: 2,
    theme,
    dismissedNoticeIds: [...new Set(ids.filter((id): id is string => typeof id === "string"))],
  };
}

function readInitial(raw: string | null): NotificationPreferences {
  if (!raw) return { ...defaultPreferences, dismissedNoticeIds: [] };
  try {
    return normalize(JSON.parse(raw)) ?? { ...defaultPreferences, dismissedNoticeIds: [] };
  } catch {
    return { ...defaultPreferences, dismissedNoticeIds: [] };
  }
}

export function createNotificationPreferenceStore(storage: StorageLike, events: StorageEventSource) {
  let preferences = readInitial(storage.getItem(notificationPreferenceStorageKey));
  let disposed = false;
  const listeners = new Set<(preferences: NotificationPreferences) => void>();
  const notify = () => { for (const listener of listeners) listener(preferences); };
  const persist = () => storage.setItem(notificationPreferenceStorageKey, JSON.stringify(preferences));
  const onStorage = (event: StorageChange) => {
    if (disposed || event.key !== notificationPreferenceStorageKey || event.newValue === null) return;
    try {
      const next = normalize(JSON.parse(event.newValue));
      if (!next) return;
      preferences = next;
      notify();
    } catch {
      return;
    }
  };
  events.addEventListener("storage", onStorage);

  return {
    get: () => preferences,
    setTheme(theme: Theme) {
      preferences = { ...preferences, theme };
      persist();
      notify();
    },
    dismissNotice(noticeId: string) {
      if (!preferences.dismissedNoticeIds.includes(noticeId)) {
        preferences = { ...preferences, dismissedNoticeIds: [...preferences.dismissedNoticeIds, noticeId] };
        persist();
        notify();
      }
    },
    subscribe(listener: (preferences: NotificationPreferences) => void) {
      if (disposed) return () => false;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      events.removeEventListener("storage", onStorage);
      listeners.clear();
    },
  };
}
