import { describe, expect, test } from "bun:test";

interface ShortcutEvent {
  key: string;
  metaKey: boolean;
}

interface ShortcutTarget {
  addEventListener(type: "keydown", listener: (event: ShortcutEvent) => void): void;
  removeEventListener(type: "keydown", listener: (event: ShortcutEvent) => void): void;
}

interface ShortcutModule {
  installSearchShortcut(
    target: ShortcutTarget,
    onOpenSearch: () => void,
  ): () => void;
}

class FakeShortcutTarget implements ShortcutTarget {
  private readonly listeners = new Set<(event: ShortcutEvent) => void>();

  addEventListener(_type: "keydown", listener: (event: ShortcutEvent) => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "keydown", listener: (event: ShortcutEvent) => void): void {
    this.listeners.delete(listener);
  }

  dispatch(event: ShortcutEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

const candidatePath =
  Bun.env.CANDIDATE_PATH ??
  "suites/react-skill-comparison/tasks/client-search-shortcut-cleanup/v1/public/starter/src/search-shortcut.ts";
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`;
const { installSearchShortcut } = (await import(candidateUrl)) as ShortcutModule;

describe("client-search-shortcut-cleanup-v1", () => {
  test("removes shortcuts from inactive pages without breaking the active page", () => {
    const target = new FakeShortcutTarget();
    let searchOpenCount = 0;

    const removeFirstPageShortcut = installSearchShortcut(target, () => {
      searchOpenCount += 1;
    });
    removeFirstPageShortcut();

    const removeSecondPageShortcut = installSearchShortcut(target, () => {
      searchOpenCount += 1;
    });

    target.dispatch({ key: "k", metaKey: true });
    target.dispatch({ key: "x", metaKey: true });
    expect(searchOpenCount).toBe(1);

    removeSecondPageShortcut();
    target.dispatch({ key: "k", metaKey: true });
    expect(searchOpenCount).toBe(1);
  });
});
