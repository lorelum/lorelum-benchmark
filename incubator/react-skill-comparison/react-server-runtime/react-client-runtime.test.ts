import { createElement, useEffect, useMemo } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { expect, test } from "bun:test";
import { JSDOM } from "jsdom";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

test("client renderer preserves memo identity and releases effects", async () => {
  const dom = new JSDOM("<!doctype html><div id=\"root\"></div>");
  const globals = globalThis as typeof globalThis & { window?: Window; document?: Document; navigator?: Navigator; HTMLElement?: typeof HTMLElement; Node?: typeof Node };
  const original = { window: globals.window, document: globals.document, navigator: globals.navigator, HTMLElement: globals.HTMLElement, Node: globals.Node };
  globals.window = dom.window as unknown as Window;
  globals.document = dom.window.document;
  globals.navigator = dom.window.navigator;
  globals.HTMLElement = dom.window.HTMLElement;
  globals.Node = dom.window.Node;
  const items = [{ id: "one", active: true }, { id: "two", active: false }];
  let derivations = 0;
  let subscriptions = 0;
  let releases = 0;
  let latest: Array<{ id: string; selected: boolean }> | undefined;

  function Board({ selectedId }: { selectedId: string | null }) {
    const rows = useMemo(() => {
      derivations += 1;
      return items.map((item) => ({ id: item.id, selected: item.id === selectedId }));
    }, [selectedId]);
    useEffect(() => {
      subscriptions += 1;
      return () => { releases += 1; };
    }, []);
    latest = rows;
    return null;
  }

  let root: Root | undefined;
  try {
    await act(async () => { root = createRoot(dom.window.document.getElementById("root")!); root.render(createElement(Board, { selectedId: "one" })); });
    const first = latest;
    await act(async () => { root!.render(createElement(Board, { selectedId: "one" })); });
    expect(latest).toBe(first);
    expect(derivations).toBe(1);
    await act(async () => { root!.render(createElement(Board, { selectedId: "two" })); });
    expect(latest).not.toBe(first);
    expect(derivations).toBe(2);
    await act(async () => { root!.unmount(); });
    expect({ subscriptions, releases }).toEqual({ subscriptions: 1, releases: 1 });
  } finally {
    dom.window.close();
    globals.window = original.window;
    globals.document = original.document;
    globals.navigator = original.navigator;
    globals.HTMLElement = original.HTMLElement;
    globals.Node = original.Node;
  }
});
