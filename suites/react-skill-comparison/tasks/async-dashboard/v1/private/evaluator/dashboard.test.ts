import { describe, expect, test } from "bun:test";

interface DashboardApi {
  getUser(): Promise<{ id: string; name: string }>;
  getBilling(): Promise<{ plan: string; balanceCents: number }>;
  getFeatureFlags(): Promise<Record<string, boolean>>;
}

interface DashboardData {
  user: { id: string; name: string };
  billing: { plan: string; balanceCents: number };
  featureFlags: Record<string, boolean>;
}

interface DashboardModule {
  loadDashboard(api: DashboardApi): Promise<DashboardData>;
}

const candidatePath =
  Bun.env.CANDIDATE_PATH ??
  "suites/react-skill-comparison/tasks/async-dashboard/v1/public/starter/src/dashboard.ts";
const candidateUrl = Bun.pathToFileURL(candidatePath).href;
const { loadDashboard } = (await import(candidateUrl)) as DashboardModule;

interface Deferred<Value> {
  promise: Promise<Value>;
  reject(error: Error): void;
  resolve(value: Value): void;
}

function deferred<Value>(): Deferred<Value> {
  let reject!: (error: Error) => void;
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

describe("async-dashboard-v1", () => {
  test("starts all independent requests before any request resolves", async () => {
    const calls: string[] = [];
    const user = deferred<{ id: string; name: string }>();
    const billing = deferred<{ plan: string; balanceCents: number }>();
    const featureFlags = deferred<Record<string, boolean>>();

    const api: DashboardApi = {
      getUser: () => {
        calls.push("user");
        return user.promise;
      },
      getBilling: () => {
        calls.push("billing");
        return billing.promise;
      },
      getFeatureFlags: () => {
        calls.push("featureFlags");
        return featureFlags.promise;
      },
    };

    const dashboard = loadDashboard(api);

    expect(calls).toEqual(["user", "billing", "featureFlags"]);

    user.resolve({ id: "user-1", name: "Ari" });
    billing.resolve({ plan: "pro", balanceCents: 1200 });
    featureFlags.resolve({ reports: true });

    await expect(dashboard).resolves.toEqual({
      user: { id: "user-1", name: "Ari" },
      billing: { plan: "pro", balanceCents: 1200 },
      featureFlags: { reports: true },
    });
  });

  test("preserves the original request error", async () => {
    const expectedError = new Error("billing is unavailable");
    const api: DashboardApi = {
      getUser: async () => ({ id: "user-1", name: "Ari" }),
      getBilling: async () => {
        throw expectedError;
      },
      getFeatureFlags: async () => ({ reports: true }),
    };

    await expect(loadDashboard(api)).rejects.toBe(expectedError);
  });
});
