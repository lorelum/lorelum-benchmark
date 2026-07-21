import { expect } from "bun:test";
import { pathToFileURL } from "node:url";
import { evaluateV2 } from "../../../../../../../src/benchmark/evaluator/v2/harness";

const report = { id: "r1", title: "Revenue", exportsEnabled: true };
async function factory(path: string) { return (await import(`${pathToFileURL(path).href}?run=${Date.now()}`) as { createReportController: Function }).createReportController; }

export async function evaluateCandidate({ candidatePath }: { candidatePath: string }) {
  const create = await factory(candidatePath);
  return evaluateV2([
    { id: "ineligible-never-loads", async run() { let calls = 0; const value = create({ id: null, canExport: false }, report, async () => { calls++; return { render: async () => "bad" }; }); expect(value.summary()).toEqual({ id: "r1", title: "Revenue", canOpenExport: false }); expect(await value.openExport()).toBeNull(); expect(calls).toBe(0); } },
    { id: "eligible-open-renders", async run() { const value = create({ id: "u", canExport: true }, report, async () => ({ render: async (input: { id: string }) => `export:${input.id}` })); expect(await value.openExport()).toBe("export:r1"); } },
    { id: "error-is-preserved-and-retryable", async run() { const error = new Error("renderer unavailable"); let calls = 0; const value = create({ id: "u", canExport: true }, report, async () => { calls++; if (calls === 1) throw error; return { render: async () => "export:r1" }; }); await expect(value.openExport()).rejects.toBe(error); expect(await value.openExport()).toBe("export:r1"); expect(calls).toBe(2); } }
  ], [
    { id: "conditional-loader-boundary", maxPoints: 50, async run() { let calls = 0; const value = create({ id: "u", canExport: true }, { ...report, exportsEnabled: false }, async () => { calls++; return { render: async () => "bad" }; }); await value.openExport(); return calls === 0 ? 50 : 0; } },
    { id: "concurrent-inflight-load-sharing", maxPoints: 50, async run() { let calls = 0; let resolve!: (value: { render(report: typeof report): Promise<string> }) => void; const pending = new Promise<{ render(report: typeof report): Promise<string> }>((done) => { resolve = done; }); const first = create({ id: "u", canExport: true }, report, () => { calls++; return pending; }); const second = create({ id: "u", canExport: true }, report, () => { calls++; return pending; }); const opening = Promise.all([first.openExport(), second.openExport()]); resolve({ render: async () => "export:r1" }); await opening; return calls === 1 ? 50 : 0; } }
  ]);
}
