import { expect } from "bun:test";
import { pathToFileURL } from "node:url";
import { evaluateV2 } from "../../../../../../../src/benchmark/evaluator/v2/harness";
function doubles(raw: string | null = null) { let listener: any; let reads = 0, writes = 0; const storage = { getItem() { reads++; return raw; }, setItem(_key: string, value: string) { writes++; raw = value; } }; const events = { add(value: any) { listener = value; }, remove(value: any) { if (listener === value) listener = undefined; }, emit(value: string | null) { listener?.("workspace-preferences", value); } }; return { storage, events, counts: () => ({ reads, writes }) }; }
async function create(path: string) { return (await import(`${pathToFileURL(path).href}?run=${Date.now()}`) as any).createPreferenceStore; }
export async function evaluateCandidate({ candidatePath }: { candidatePath: string }) { const factory = await create(candidatePath); return evaluateV2([
  { id: "unavailable-storage-defaults", run() { const value = factory(undefined, { add() {}, remove() {} }).get(); expect(value).toEqual({ version: 1, theme: "system", compact: false }); } },
  { id: "invalid-records-ignored", run() { const test = doubles('{"version":2}'); expect(factory(test.storage, test.events).get()).toEqual({ version: 1, theme: "system", compact: false }); } },
  { id: "release-stops-notification", run() { const test = doubles(); const store = factory(test.storage, test.events); const updates: any[] = []; const release = store.subscribe((value: any) => updates.push(value)); release(); release(); test.events.emit('{"version":1,"theme":"dark","compact":true}'); expect(updates).toEqual([]); } },
  { id: "valid-local-update", run() { const test = doubles(); const store = factory(test.storage, test.events); const updates: any[] = []; store.subscribe((value: any) => updates.push(value)); store.setTheme("dark"); expect(store.get().theme).toBe("dark"); expect(test.counts().writes).toBe(1); expect(updates).toHaveLength(1); } }
], [
  { id: "single-initial-read", maxPoints: 50, run() { const test = doubles('{"version":1,"theme":"light","compact":false}'); const store = factory(test.storage, test.events); store.get(); store.get(); return test.counts().reads === 1 ? 50 : 0; } },
  { id: "no-equivalent-write-or-notify", maxPoints: 50, run() { const test = doubles(); const store = factory(test.storage, test.events); let updates = 0; store.subscribe(() => updates++); store.setTheme("system"); test.events.emit('{"version":1,"theme":"system","compact":false}'); return test.counts().writes === 0 && updates === 0 ? 50 : 0; } }
]); }
