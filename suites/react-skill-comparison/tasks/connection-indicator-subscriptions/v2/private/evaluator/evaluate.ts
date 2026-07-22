import { expect } from "bun:test";
import { pathToFileURL } from "node:url";
import { evaluateV2 } from "../../../../../../../src/benchmark/evaluator/v2/harness";
type Source = { subscribe(listener: (value: unknown) => void): () => void; emit(value: unknown): void; adds: number; removes: number };
function source(): Source { const listeners = new Set<(value: unknown) => void>(); let adds = 0, removes = 0; return { get adds() { return adds; }, get removes() { return removes; }, subscribe(listener) { adds++; listeners.add(listener); let released = false; return () => { if (!released) { released = true; removes++; listeners.delete(listener); } }; }, emit(value) { for (const listener of [...listeners]) listener(value); } }; }
async function indicator(path: string) { return (await import(`${pathToFileURL(path).href}?run=${Date.now()}`) as any).createConnectionIndicator; }
export async function evaluateCandidate({ candidatePath }: { candidatePath: string }) { const create = await indicator(candidatePath); return evaluateV2([
  { id: "immediate-valid-state", run() { const events: string[] = []; create(source(), "offline").subscribe((value: string) => events.push(value)); expect(events).toEqual(["offline"]); } },
  { id: "invalid-events-ignored", run() { const input = source(), events: string[] = []; create(input, "offline").subscribe((value: string) => events.push(value)); input.emit("unknown"); input.emit("online"); input.emit("online"); expect(events).toEqual(["offline", "online"]); } },
  { id: "release-is-idempotent", run() { const input = source(), events: string[] = []; const release = create(input, "offline").subscribe((value: string) => events.push(value)); release(); release(); input.emit("online"); expect(events).toEqual(["offline"]); expect(input.removes).toBe(1); } },
  { id: "delivery-snapshot", run() { const input = source(), first: string[] = [], second: string[] = []; const value = create(input, "offline"); value.subscribe((state: string) => { first.push(state); if (state === "online") value.subscribe((next: string) => second.push(next)); }); input.emit("online"); input.emit("offline"); expect(second).toEqual(["online", "offline"]); } }
], [
  { id: "single-underlying-listener", maxPoints: 50, run() { const input = source(), value = create(input, "offline"); const a = value.subscribe(() => {}), b = value.subscribe(() => {}); const score = input.adds === 1 ? 50 : 0; a(); b(); return score; } },
  { id: "cleanup-across-lifecycles", maxPoints: 50, run() { const input = source(), value = create(input, "offline"); const first = value.subscribe(() => {}); first(); const second = value.subscribe(() => {}); second(); return input.adds === 2 && input.removes === 2 ? 50 : 0; } }
]); }
