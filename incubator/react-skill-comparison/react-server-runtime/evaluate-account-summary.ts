import { Suspense, createElement, use } from "react";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { renderToReadableStream } from "react-server-dom-webpack/server.node";
const source = Bun.argv[2]; if (!source) throw new Error("candidate path is required");
const staged = join(import.meta.dir, `.candidate-${crypto.randomUUID()}.ts`);
await Bun.write(staged, await Bun.file(source).arrayBuffer());
try {
  const mod = await import(`${Bun.pathToFileURL(staged).href}?run=${Date.now()}`) as { loadAccountSummary(api: any, input: { accountId: string }): Promise<any> };
  const checks: any[] = []; const check = async (id: string, run: () => Promise<void>) => { try { await run(); checks.push({ id, passed: true }); } catch (error) { checks.push({ id, passed: false, failure_reason: error instanceof Error ? error.message : String(error) }); } };
  await check("blank-input-avoids-io", async () => { let calls = 0; const api = { async getAccount() { calls++; return null; }, async getPermissions() { calls++; return { canManage: false }; } }; if (await mod.loadAccountSummary(api, { accountId: " " }) !== null || calls) throw new Error("blank input performed I/O"); });
  await check("missing-account-skips-permissions", async () => { let permissions = 0; const api = { async getAccount() { return null; }, async getPermissions() { permissions++; return { canManage: false }; } }; if (await mod.loadAccountSummary(api, { accountId: "a" }) !== null || permissions) throw new Error("missing account read permissions"); });
  await check("original-errors-are-preserved", async () => { const error = new Error("unavailable"); const api = { async getAccount() { throw error; }, async getPermissions() { return { canManage: false }; } }; try { await mod.loadAccountSummary(api, { accountId: "a" }); } catch (received) { if (received === error) return; } throw new Error("repository error was replaced"); });
  const semantic = checks.every((item) => item.passed); let probes: any[] = [];
  if (semantic) { let accounts = 0, permissions = 0; const api = { async getAccount(id: string) { accounts++; return { id, name: "A" }; }, async getPermissions() { permissions++; return { canManage: true }; } }; function Panel() { return createElement("span", null, use(mod.loadAccountSummary(api, { accountId: " acct " })).account.name); } const view = () => createElement(Suspense, { fallback: null }, createElement(Panel), createElement(Panel)); await new Response(renderToReadableStream(view(), {})).text(); const same = accounts === 1 && permissions === 1 ? 70 : 0; await new Response(renderToReadableStream(view(), {})).text(); probes = [{ id: "same-render-deduplication", points: same, max_points: 70 }, { id: "render-scope-separation", points: accounts === 2 && permissions === 2 ? 30 : 0, max_points: 30 }]; }
  console.log(JSON.stringify({ schema_version: "evaluator-result/v2", evaluator_version: 2, semantic: { passed: semantic, checks }, quality: { score: semantic ? probes.reduce((sum, probe) => sum + probe.points, 0) : 0, probes } }));
} finally { await rm(staged, { force: true }); }
