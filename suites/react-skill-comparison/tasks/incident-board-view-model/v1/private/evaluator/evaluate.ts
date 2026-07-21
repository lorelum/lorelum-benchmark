import { expect } from "bun:test";
import { pathToFileURL } from "node:url";
import { evaluateV2 } from "../../../../../../../src/benchmark/evaluator/v2/harness";
type Incident = { id: string; title: string; status: "open" | "resolved" };
type Board = { select(id: string | null): void; render(incidents: Incident[], filter: { status: "open" | "resolved" | "all" }): Array<Incident & { isSelected: boolean; select(): void }>; getDerivationCount(): number };
const incidents: Incident[] = [{ id: "a", title: "Login", status: "open" }, { id: "b", title: "Search", status: "open" }, { id: "c", title: "Archive", status: "resolved" }];
async function board(path: string): Promise<Board> { return (await import(`${pathToFileURL(path).href}?run=${Date.now()}`) as { createIncidentBoard(): Board }).createIncidentBoard(); }
export async function evaluateCandidate({ candidatePath }: { candidatePath: string }) { const value = await board(candidatePath); return evaluateV2([
  { id: "filtered-shape", run() { expect(value.render(incidents, { status: "open" }).map((row) => row.id)).toEqual(["a", "b"]); } },
  { id: "selection-transitions", run() { value.select("b"); expect(value.render(incidents, { status: "all" }).map((row) => row.isSelected)).toEqual([false, true, false]); value.select("missing"); expect(value.render(incidents, { status: "all" }).some((row) => row.isSelected)).toBe(false); } },
  { id: "input-immutability", run() { const original = JSON.stringify(incidents); value.render(incidents, { status: "all" }); expect(JSON.stringify(incidents)).toBe(original); } }
], [
  { id: "stable-unaffected-rows", maxPoints: 40, run() { const first = value.render(incidents, { status: "all" }); const changed = value.render([incidents[0]!, { ...incidents[1]!, title: "Search faster" }, incidents[2]!], { status: "all" }); return changed[0] === first[0] && changed[2] === first[2] && changed[1] !== first[1] ? 40 : 0; } },
  { id: "stable-callbacks", maxPoints: 30, run() { const first = value.render(incidents, { status: "all" }); const second = value.render([...incidents], { status: "all" }); return second[0]?.select === first[0]?.select && second[2]?.select === first[2]?.select ? 30 : 0; } },
  { id: "bounded-derivation", maxPoints: 30, run() { const before = value.getDerivationCount(); value.render([...incidents], { status: "all" }); return value.getDerivationCount() === before ? 30 : 0; } }
]); }
