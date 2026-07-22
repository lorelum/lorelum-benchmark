import { rm } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const source = Bun.argv[2];
if (!source) throw new Error("candidate path is required");
const runtimeDirectory = join(import.meta.dir, "../../../../../../../incubator/react-skill-comparison/react-server-runtime");
const staged = join(runtimeDirectory, `.workspace-brief-${crypto.randomUUID()}.ts`);
const { Suspense, createElement, use } = await import(pathToFileURL(join(runtimeDirectory, "node_modules", "react")).href) as typeof import("react");
const { renderToReadableStream } = await import(pathToFileURL(join(runtimeDirectory, "node_modules", "react-server-dom-webpack", "server.node.js")).href) as typeof import("react-server-dom-webpack/server.node");
await Bun.write(staged, await Bun.file(source).arrayBuffer());
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const result = { schema_version: "evaluator-result/v2", evaluator_version: 2, semantic: { passed: false, checks: [] as Array<{ id: string; passed: boolean; failure_reason?: string }> }, quality: { score: 0, probes: [] as Array<{ id: string; points: number; max_points: number }> } };
const check = async (id: string, run: () => Promise<void>) => { try { await run(); result.semantic.checks.push({ id, passed: true }); } catch (error) { result.semantic.checks.push({ id, passed: false, failure_reason: error instanceof Error ? error.message : String(error) }); } };
try {
  const mod = await import(`${Bun.pathToFileURL(staged).href}?run=${Date.now()}`) as { createWorkspaceBriefLoader(api: any): (input: { workspaceId: string }) => Promise<any> };
  await check("blank-input-avoids-io", async () => { let calls = 0; const loader = mod.createWorkspaceBriefLoader({ getWorkspace: async () => { calls++; return null; }, getQuota: async () => { calls++; return { seats: 1, used: 1 }; }, getPinnedProjectIds: async () => { calls++; return []; }, getProjectSummaries: async () => { calls++; return []; } }); if (await loader({ workspaceId: "  " }) !== null || calls) throw new Error("blank input performed I/O"); });
  await check("aggregate-shape", async () => { const loader = mod.createWorkspaceBriefLoader({ getWorkspace: async (id: string) => ({ id, name: "North" }), getQuota: async () => ({ seats: 8, used: 3 }), getPinnedProjectIds: async () => ["p1"], getProjectSummaries: async () => [{ id: "p1", title: "Roadmap" }] }); const actual = await loader({ workspaceId: " north " }); if (JSON.stringify(actual) !== JSON.stringify({ workspace: { id: "north", name: "North" }, quota: { seats: 8, used: 3 }, projects: [{ id: "p1", title: "Roadmap" }] })) throw new Error("brief shape is incorrect"); });
  await check("missing-workspace-skips-projects", async () => { let projectCalls = 0; const loader = mod.createWorkspaceBriefLoader({ getWorkspace: async () => null, getQuota: async () => ({ seats: 1, used: 0 }), getPinnedProjectIds: async () => { projectCalls++; return []; }, getProjectSummaries: async () => { projectCalls++; return []; } }); if (await loader({ workspaceId: "north" }) !== null || projectCalls) throw new Error("missing workspace read projects"); });
  await check("original-errors-are-preserved", async () => { const error = new Error("quota unavailable"); const loader = mod.createWorkspaceBriefLoader({ getWorkspace: async () => ({ id: "north", name: "North" }), getQuota: async () => { throw error; }, getPinnedProjectIds: async () => [], getProjectSummaries: async () => [] }); try { await loader({ workspaceId: "north" }); } catch (received) { if (received === error) return; } throw new Error("repository error was replaced"); });
  result.semantic.passed = result.semantic.checks.every((item) => item.passed);
  if (result.semantic.passed) {
    let workspaceCalls = 0, quotaCalls = 0, idsCalls = 0, summariesCalls = 0;
    const api = { getWorkspace: async (id: string) => { workspaceCalls++; return { id, name: "North" }; }, getQuota: async () => { quotaCalls++; return { seats: 8, used: 3 }; }, getPinnedProjectIds: async () => { idsCalls++; return ["p1"]; }, getProjectSummaries: async () => { summariesCalls++; return [{ id: "p1", title: "Roadmap" }]; } };
    const loader = mod.createWorkspaceBriefLoader(api);
    const render = async () => { function Panel({ id }: { id: string }) { return createElement("span", null, use(loader({ workspaceId: id })).workspace.name); } const view = createElement(Suspense, { fallback: null }, createElement(Panel, { id: "north" }), createElement(Panel, { id: " north " }), createElement(Panel, { id: "north" })); await new Response(renderToReadableStream(view, {})).text(); };
    await render();
    const sameRender = workspaceCalls === 1 && quotaCalls === 1 && idsCalls === 1 && summariesCalls === 1 ? 30 : 0;
    await render();
    const freshRender = workspaceCalls === 2 && quotaCalls === 2 && idsCalls === 2 && summariesCalls === 2 ? 10 : 0;
    const rootsWorkspace = deferred<any>(), rootsQuota = deferred<any>(), rootsIds = deferred<string[]>(), rootsSummaries = deferred<any[]>(); const rootCalls: string[] = [];
    const rootLoader = mod.createWorkspaceBriefLoader({ getWorkspace: () => { rootCalls.push("workspace"); return rootsWorkspace.promise; }, getQuota: () => { rootCalls.push("quota"); return rootsQuota.promise; }, getPinnedProjectIds: () => { rootCalls.push("ids"); return rootsIds.promise; }, getProjectSummaries: () => { rootCalls.push("summaries"); return rootsSummaries.promise; } });
    const pending = rootLoader({ workspaceId: "north" }); const roots = rootCalls.join(",") === "workspace,quota" ? 30 : 0;
    rootsWorkspace.resolve({ id: "north", name: "North" }); await flush(); const idsStarted = rootCalls.join(",") === "workspace,quota,ids";
    rootsIds.resolve(["p1"]); await flush(); const summariesStarted = rootCalls.join(",") === "workspace,quota,ids,summaries";
    rootsQuota.resolve({ seats: 8, used: 3 }); rootsSummaries.resolve([{ id: "p1", title: "Roadmap" }]); await pending;
    result.quality.probes = [{ id: "same-render-sharing", points: sameRender, max_points: 30 }, { id: "render-scope-freshness", points: freshRender, max_points: 10 }, { id: "independent-roots", points: roots, max_points: 30 }, { id: "partial-dependency-fanout", points: idsStarted && summariesStarted ? 30 : 0, max_points: 30 }];
    result.quality.score = result.quality.probes.reduce((sum, probe) => sum + probe.points, 0);
  }
  console.log(JSON.stringify(result));
} finally { await rm(staged, { force: true }); }
