import { expect } from "bun:test";
import { copyFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createElement, memo } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { JSDOM } from "jsdom";
import { evaluateV2 } from "../../../src/benchmark/evaluator/v2/harness";

type Status = "open" | "resolved";
type Incident = { id: string; title: string; status: Status };
type Row = { incident: Incident; isSelected: boolean; select(): void };
type Hook = (incidents: readonly Incident[], filter: Status | "all", selected: string | null, onSelect: (id: string) => void) => Row[];
const base: Incident[] = [{ id: "a", title: "Login", status: "open" }, { id: "b", title: "Search", status: "open" }, { id: "c", title: "Archive", status: "resolved" }];

async function load(path: string): Promise<Hook> {
  const staged = join(import.meta.dir, `.candidate-${crypto.randomUUID()}.ts`);
  await copyFile(path, staged);
  try { return (await import(`${pathToFileURL(staged).href}?run=${Date.now()}`) as { useIncidentBoardRows: Hook }).useIncidentBoardRows; }
  finally { await rm(staged, { force: true }); }
}

function harness(hook: Hook) {
  const dom = new JSDOM("<!doctype html><div id=\"root\"></div>");
  const globals = globalThis as typeof globalThis & { window?: Window; document?: Document; navigator?: Navigator; HTMLElement?: typeof HTMLElement; Node?: typeof Node };
  const original = { window: globals.window, document: globals.document, navigator: globals.navigator, HTMLElement: globals.HTMLElement, Node: globals.Node };
  globals.window = dom.window as unknown as Window; globals.document = dom.window.document; globals.navigator = dom.window.navigator; globals.HTMLElement = dom.window.HTMLElement; globals.Node = dom.window.Node;
  const renders = new Map<string, number>(); let latest: Row[] = []; let root: Root | undefined;
  let current!: { incidents: readonly Incident[]; filter: Status | "all"; selected: string | null; onSelect: (id: string) => void };
  const Probe = memo(function Probe({ row }: { row: Row }) { renders.set(row.incident.id, (renders.get(row.incident.id) ?? 0) + 1); return null; });
  function Board() { latest = hook(current.incidents, current.filter, current.selected, current.onSelect); return createElement("div", null, latest.map((row) => createElement(Probe, { key: row.incident.id, row }))); }
  async function render(incidents: readonly Incident[], filter: Status | "all", selected: string | null, onSelect: (id: string) => void) {
    current = { incidents, filter, selected, onSelect };
    await act(async () => { if (!root) root = createRoot(dom.window.document.getElementById("root")!); root.render(createElement(Board)); });
    return latest;
  }
  return { render, latest: () => latest, renders, async close() { await act(async () => { root?.unmount(); }); dom.window.close(); globals.window = original.window; globals.document = original.document; globals.navigator = original.navigator; globals.HTMLElement = original.HTMLElement; globals.Node = original.Node; } };
}

export async function evaluateCandidate({ candidatePath }: { candidatePath: string }) {
  const hook = await load(candidatePath);
  const make = () => harness(hook);
  return evaluateV2([
    { id: "filter-and-selection-shape", async run() { const value = make(); try { expect((await value.render(base, "open", "b", () => {})).map((row) => [row.incident.id, row.isSelected])).toEqual([["a", false], ["b", true]]); expect((await value.render(base, "resolved", "b", () => {})).map((row) => row.incident.id)).toEqual(["c"]); } finally { await value.close(); } } },
    { id: "select-uses-latest-callback", async run() { const value = make(); const calls: string[] = []; try { await value.render(base, "all", null, (id) => calls.push(`old:${id}`)); const second = await value.render(base, "all", null, (id) => calls.push(`new:${id}`)); second[0]!.select(); expect(calls).toEqual(["new:a"]); } finally { await value.close(); } } },
    { id: "inputs-remain-unchanged", async run() { const value = make(); const before = JSON.stringify(base); try { await value.render(base, "all", null, () => {}); expect(JSON.stringify(base)).toBe(before); } finally { await value.close(); } } },
  ], [
    { id: "unaffected-row-render-isolation", maxPoints: 40, async run() { const value = make(); try { await value.render(base, "all", null, () => {}); const before = new Map(value.renders); await value.render([base[0]!, { ...base[1]!, title: "Faster search" }, base[2]!], "all", null, () => {}); return value.renders.get("a") === before.get("a") && value.renders.get("c") === before.get("c") && (value.renders.get("b") ?? 0) === (before.get("b") ?? 0) + 1 ? 40 : 0; } finally { await value.close(); } } },
    { id: "selection-local-identity", maxPoints: 30, async run() { const value = make(); const onSelect = () => {}; try { const first = await value.render(base, "open", "a", onSelect); const before = new Map(value.renders); const second = await value.render(base, "open", "b", onSelect); return second[0] !== first[0] && second[1] !== first[1] && value.renders.get("a") === (before.get("a") ?? 0) + 1 && value.renders.get("b") === (before.get("b") ?? 0) + 1 ? 30 : 0; } finally { await value.close(); } } },
    { id: "stable-row-and-callback-on-equivalent-render", maxPoints: 30, async run() { const value = make(); try { const first = await value.render(base, "all", null, () => {}); const second = await value.render([...base], "all", null, () => {}); return second[0] === first[0] && second[0]?.select === first[0]?.select ? 30 : 0; } finally { await value.close(); } } },
  ]);
}

const candidatePath = Bun.argv[2];
if (!candidatePath) throw new Error("Candidate path is required");
console.log(JSON.stringify(await evaluateCandidate({ candidatePath })));
