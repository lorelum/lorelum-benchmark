export type Theme = "system" | "light" | "dark";
export interface Preferences { version: 1; theme: Theme; compact: boolean; }
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; }
export interface Events { add(listener: (key: string, value: string | null) => void): void; remove(listener: (key: string, value: string | null) => void): void; }
export interface Store { get(): Preferences; setTheme(theme: Theme): void; subscribe(listener: (value: Preferences) => void): () => void; dispose(): void; }
export const preferenceKey = "workspace-preferences";
export function createPreferenceStore(storage: StorageLike | undefined, events: Events): Store { let value: Preferences = { version: 1, theme: "system", compact: false }; const listeners = new Set<(value: Preferences) => void>(); return { get: () => { if (storage) value = JSON.parse(storage.getItem(preferenceKey) ?? "null"); return value; }, setTheme(theme) { value = { ...value, theme }; storage?.setItem(preferenceKey, JSON.stringify(value)); for (const listener of listeners) listener(value); }, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }, dispose() {} }; }
