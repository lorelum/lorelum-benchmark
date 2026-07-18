import { describe, expect, test } from "bun:test";

type Theme = "system" | "light" | "dark";

interface NotificationPreferences {
  version: 2;
  theme: Theme;
  dismissedNoticeIds: string[];
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StorageChange {
  key: string | null;
  newValue: string | null;
}

interface StorageEventSource {
  addEventListener(type: "storage", listener: (event: StorageChange) => void): void;
  removeEventListener(type: "storage", listener: (event: StorageChange) => void): void;
}

interface NotificationPreferenceStore {
  get(): NotificationPreferences;
  setTheme(theme: Theme): void;
  dismissNotice(noticeId: string): void;
  subscribe(listener: (preferences: NotificationPreferences) => void): () => void;
  dispose(): void;
}

interface NotificationPreferenceModule {
  createNotificationPreferenceStore(storage: StorageLike, events: StorageEventSource): NotificationPreferenceStore;
  notificationPreferenceStorageKey: string;
}

class MemoryStorage implements StorageLike {
  constructor(private values = new Map<string, string>()) {}

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

class MemoryStorageEvents implements StorageEventSource {
  private listeners = new Set<(event: StorageChange) => void>();

  addEventListener(_type: "storage", listener: (event: StorageChange) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "storage", listener: (event: StorageChange) => void): void {
    this.listeners.delete(listener);
  }

  emit(event: StorageChange): void {
    for (const listener of this.listeners) listener(event);
  }

  get size(): number {
    return this.listeners.size;
  }
}

const candidatePath = Bun.env.CANDIDATE_PATH ?? "suites/react-skill-comparison/tasks/notification-preference-store/v1/public/starter/src/notification-preferences.ts";
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`;
const { createNotificationPreferenceStore, notificationPreferenceStorageKey } = (await import(candidateUrl)) as NotificationPreferenceModule;

describe("notification-preference-store-v1", () => {
  test("falls back safely and normalizes legacy preferences", () => {
    const invalidStore = createNotificationPreferenceStore(new MemoryStorage(new Map([[notificationPreferenceStorageKey, "{"]])), new MemoryStorageEvents());
    expect(invalidStore.get()).toEqual({ version: 2, theme: "system", dismissedNoticeIds: [] });

    const legacyStore = createNotificationPreferenceStore(
      new MemoryStorage(new Map([[notificationPreferenceStorageKey, JSON.stringify({ theme: "dark", dismissedIds: ["release", "release", 3] })]])),
      new MemoryStorageEvents(),
    );
    expect(legacyStore.get()).toEqual({ version: 2, theme: "dark", dismissedNoticeIds: ["release"] });
  });

  test("persists normalized mutations and notifies local subscribers", () => {
    const storage = new MemoryStorage();
    const store = createNotificationPreferenceStore(storage, new MemoryStorageEvents());
    const updates: NotificationPreferences[] = [];
    const unsubscribe = store.subscribe((preferences) => updates.push(preferences));

    store.setTheme("light");
    store.dismissNotice("release");
    store.dismissNotice("release");
    unsubscribe();
    store.setTheme("dark");

    expect(JSON.parse(storage.getItem(notificationPreferenceStorageKey) ?? "null")).toEqual({
      version: 2,
      theme: "dark",
      dismissedNoticeIds: ["release"],
    });
    expect(updates).toEqual([
      { version: 2, theme: "light", dismissedNoticeIds: [] },
      { version: 2, theme: "light", dismissedNoticeIds: ["release"] },
    ]);
  });

  test("scopes storage synchronization and removes its listener on disposal", () => {
    const events = new MemoryStorageEvents();
    const store = createNotificationPreferenceStore(new MemoryStorage(), events);
    const updates: NotificationPreferences[] = [];
    store.subscribe((preferences) => updates.push(preferences));
    expect(events.size).toBe(1);

    events.emit({ key: "other-key", newValue: JSON.stringify({ version: 2, theme: "dark", dismissedNoticeIds: [] }) });
    events.emit({ key: notificationPreferenceStorageKey, newValue: JSON.stringify({ version: 2, theme: "dark", dismissedNoticeIds: ["release", "release"] }) });
    expect(store.get()).toEqual({ version: 2, theme: "dark", dismissedNoticeIds: ["release"] });
    expect(updates).toEqual([{ version: 2, theme: "dark", dismissedNoticeIds: ["release"] }]);

    store.dispose();
    expect(events.size).toBe(0);
    events.emit({ key: notificationPreferenceStorageKey, newValue: JSON.stringify({ version: 2, theme: "light", dismissedNoticeIds: [] }) });
    expect(store.get().theme).toBe("dark");
  });
});
