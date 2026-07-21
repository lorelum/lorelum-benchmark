import { expect } from "bun:test";
import { pathToFileURL } from "node:url";
import { evaluateV2 } from "../../../../../../../src/benchmark/evaluator/v2/harness";
const report = { id: "r1", title: "Revenue", exportsEnabled: true };
async function factory(path: string) { return (await import(`${pathToFileURL(path).href}?run=${Date.now()}`) as any).createReportController; }
export async function evaluateCandidate({ candidatePath }: { candidatePath: string }) { const create = await factory(candidatePath); return evaluateV2([
  { id: "denied-summary-is-safe", async run() { let calls = 0; const value = create({ id: null, canExport: false }, report, async () => { calls++; return { render: async () => "bad" }; }); expect(value.summary()).toEqual({ id: "r1", title: "Revenue", canOpenExport: false }); expect(await value.openExport()).toBeNull(); expect(calls).toBe(0); } },
  { id: "disabled-report-never-loads", async run() { let calls = 0; const value = create({ id: "u", canExport: true }, { ...report, exportsEnabled: false }, async () => { calls++; return { render: async () => "bad" }; }); expect(await value.openExport()).toBeNull(); expect(calls).toBe(0); } },
  { id: "loader-error-preserved", async run() { const error = new Error("renderer unavailable"); const value = create({ id: "u", canExport: true }, report, async () => { throw error; }); await expect(value.openExport()).rejects.toBe(error); } },
  { id: "authorised-open-renders", async run() { const value = create({ id: "u", canExport: true }, report, async () => ({ render: async (input: any) => `export:${input.id}` })); expect(await value.openExport()).toBe("export:r1"); } }
], [
  { id: "non-export-paths-load-nothing", maxPoints: 50, async run() { let calls = 0; const value = create({ id: null, canExport: false }, report, async () => { calls++; return { render: async () => "bad" }; }); value.summary(); await value.openExport(); return calls === 0 ? 50 : 0; } },
  { id: "concurrent-instance-load-sharing", maxPoints: 50, async run() { let calls = 0; let resolve!: (value: any) => void; const pending = new Promise<any>((done) => { resolve = done; }); const value = create({ id: "u", canExport: true }, report, () => { calls++; return pending; }); const first = value.openExport(); const second = value.openExport(); resolve({ render: async () => "export:r1" }); await Promise.all([first, second]); const other = create({ id: "u", canExport: true }, report, async () => { calls++; return { render: async () => "export:r1" }; }); await other.openExport(); return calls === 2 ? 50 : 0; } }
]); }
