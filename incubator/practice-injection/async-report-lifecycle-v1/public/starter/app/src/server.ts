import { createReport, getReport, pauseReport, resumeReport } from "./report-service";
import { ReportStore, ReportStoreError } from "./store";
import { publicReport, type ApiVersion } from "./types";

export type ServerOptions = {
  dataDir?: string;
};

function dataDir(options: ServerOptions): string {
  return options.dataDir ?? process.env.REPORT_DATA_DIR ?? `${process.cwd()}/.data/reports`;
}

function json(value: unknown, status = 200): Response {
  return new Response(`${JSON.stringify(value)}\n`, {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function bodyId(request: Request): Promise<string | undefined> {
  if (request.method !== "POST") return undefined;
  const text = await request.text();
  if (!text.trim()) return undefined;
  try {
    const body = JSON.parse(text) as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) throw new Error("invalid body");
    const id = (body as Record<string, unknown>).id;
    if (id !== undefined && typeof id !== "string") throw new Error("invalid id");
    return id as string | undefined;
  } catch {
    throw new ReportStoreError("INVALID_JSON", "request body is not valid JSON", 400);
  }
}

function route(pathname: string): { version: ApiVersion; resource: "collection" | "report" | "pause" | "resume"; id?: string } | null {
  const match = pathname.match(/^\/api\/v([12])\/reports(?:\/([^/]+)(?:\/(pause|resume))?)?$/);
  if (!match) return null;
  const version = Number(match[1]) as ApiVersion;
  const id = match[2];
  const action = match[3] as "pause" | "resume" | undefined;
  if (!id) return { version, resource: "collection" };
  return { version, resource: action ?? "report", id };
}

export function createHandler(options: ServerOptions = {}): (request: Request) => Promise<Response> {
  const store = new ReportStore(dataDir(options));
  return async (request: Request): Promise<Response> => {
    try {
      const parsed = new URL(request.url);
      const target = route(parsed.pathname);
      if (!target) return json({ error: { code: "NOT_FOUND", summary: "route was not found" } }, 404);
      if (target.resource === "collection") {
        if (request.method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", summary: "method is not allowed" } }, 405);
        const id = await bodyId(request);
        const created = await createReport(store, target.version, id);
        return json(publicReport(created, target.version), 201);
      }
      if (!target.id) return json({ error: { code: "REPORT_NOT_FOUND", summary: "report was not found" } }, 404);
      if (target.resource === "report") {
        if (request.method !== "GET") return json({ error: { code: "METHOD_NOT_ALLOWED", summary: "method is not allowed" } }, 405);
        return json(await getReport(store, target.version, target.id));
      }
      if (request.method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", summary: "method is not allowed" } }, 405);
      const state = target.resource === "pause"
        ? await pauseReport(store, target.version, target.id)
        : await resumeReport(store, target.version, target.id);
      return json(publicReport(state, target.version));
    } catch (caught) {
      const error = caught instanceof ReportStoreError ? caught : new ReportStoreError("INTERNAL_ERROR", "request could not be completed", 500);
      return json({ error: { code: error.code, summary: error.message } }, error.httpStatus);
    }
  };
}

if (import.meta.main) {
  const port = Number(process.env.REPORT_PORT ?? "3000");
  const server = Bun.serve({ port, fetch: createHandler() });
  console.log(JSON.stringify({ status: "listening", port: server.port }));
}
