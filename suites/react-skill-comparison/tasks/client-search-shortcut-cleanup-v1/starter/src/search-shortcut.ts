export interface ShortcutEvent {
  key: string;
  metaKey: boolean;
}

export interface ShortcutTarget {
  addEventListener(type: "keydown", listener: (event: ShortcutEvent) => void): void;
  removeEventListener(type: "keydown", listener: (event: ShortcutEvent) => void): void;
}

export function installSearchShortcut(
  target: ShortcutTarget,
  onOpenSearch: () => void,
): () => void {
  const listener = (event: ShortcutEvent) => {
    if (event.metaKey && event.key.toLowerCase() === "k") {
      onOpenSearch();
    }
  };

  target.addEventListener("keydown", listener);

  return () => {};
}
