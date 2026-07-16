import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface Viewer {
  id: string;
  name: string;
}

interface DashboardApi {
  getViewer(): Promise<Viewer>;
  getNavigation(viewerId: string): Promise<string[]>;
}

interface DashboardData {
  header: { viewerName: string };
  navigation: string[];
}

interface DashboardLoaderModule {
  createDashboardLoader(api: DashboardApi): () => Promise<DashboardData>;
}

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve(value: Value): void;
}

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

const candidatePath =
  process.env.CANDIDATE_PATH ??
  "suites/react-skill-comparison/tasks/server-request-viewer-dedup-v1/starter/src/dashboard-loader.ts";
const candidateUrl = `${pathToFileURL(resolve(candidatePath)).href}?run=${Date.now()}`;
const { createDashboardLoader } =
  (await import(candidateUrl)) as DashboardLoaderModule;

describe("server-request-viewer-dedup-v1", () => {
  test("shares one viewer lookup within a loader", async () => {
    const viewer = deferred<Viewer>();
    const calls: string[] = [];
    const loadDashboard = createDashboardLoader({
      getViewer() {
        calls.push("viewer");
        return viewer.promise;
      },
      async getNavigation(viewerId) {
        calls.push(`navigation:${viewerId}`);
        return ["Projects"];
      },
    });

    const dashboard = loadDashboard();
    expect(calls).toEqual(["viewer"]);

    viewer.resolve({ id: "viewer-1", name: "Ari" });
    await expect(dashboard).resolves.toEqual({
      header: { viewerName: "Ari" },
      navigation: ["Projects"],
    });
    expect(calls).toEqual(["viewer", "navigation:viewer-1"]);
  });

  test("does not share a viewer result with a separate loader", async () => {
    let viewerCalls = 0;
    const api: DashboardApi = {
      async getViewer() {
        viewerCalls += 1;
        return { id: `viewer-${viewerCalls}`, name: `Viewer ${viewerCalls}` };
      },
      async getNavigation(viewerId) {
        return [viewerId];
      },
    };

    await expect(createDashboardLoader(api)()).resolves.toEqual({
      header: { viewerName: "Viewer 1" },
      navigation: ["viewer-1"],
    });
    await expect(createDashboardLoader(api)()).resolves.toEqual({
      header: { viewerName: "Viewer 2" },
      navigation: ["viewer-2"],
    });
  });
});
