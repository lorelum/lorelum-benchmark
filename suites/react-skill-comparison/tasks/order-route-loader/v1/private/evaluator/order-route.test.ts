import { describe, expect, test } from "bun:test";

interface Viewer { id: string; accountId: string; }
interface Order { id: string; accountId: string; customerName: string; totalCents: number; internalNotes: string; }
interface ShippingEstimate { arrivalDate: string; }
interface RefundPolicy { refundable: boolean; }
interface OrderRouteApi {
  getViewer(): Promise<Viewer>;
  getOrder(orderId: string): Promise<Order>;
  getShippingEstimate(orderId: string): Promise<ShippingEstimate>;
  getRefundPolicy(accountId: string): Promise<RefundPolicy>;
}

type OrderRouteResult =
  | { kind: "not-found" }
  | { kind: "forbidden" }
  | { kind: "ok"; order: { id: string; customerName: string; totalCents: number }; shipping: ShippingEstimate; canRefund: boolean };

interface OrderRouteModule {
  loadOrderRoute(api: OrderRouteApi, orderId: string): Promise<OrderRouteResult>;
}

interface Deferred<Value> { promise: Promise<Value>; resolve(value: Value): void; }

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

const candidatePath = Bun.env.CANDIDATE_PATH ?? "suites/react-skill-comparison/tasks/order-route-loader/v1/public/starter/src/order-route.ts";
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`;
const { loadOrderRoute } = (await import(candidateUrl)) as OrderRouteModule;

describe("order-route-loader-v1", () => {
  test("avoids I/O for empty ids and contains unauthorized requests", async () => {
    let calls = 0;
    const emptyApi: OrderRouteApi = {
      async getViewer() { calls += 1; throw new Error("unexpected"); },
      async getOrder() { calls += 1; throw new Error("unexpected"); },
      async getShippingEstimate() { calls += 1; throw new Error("unexpected"); },
      async getRefundPolicy() { calls += 1; throw new Error("unexpected"); },
    };
    await expect(loadOrderRoute(emptyApi, " ")).resolves.toEqual({ kind: "not-found" });
    expect(calls).toBe(0);

    const unauthorizedCalls: string[] = [];
    const unauthorizedApi: OrderRouteApi = {
      async getViewer() { unauthorizedCalls.push("viewer"); return { id: "viewer-1", accountId: "account-a" }; },
      async getOrder() { unauthorizedCalls.push("order"); return { id: "order-1", accountId: "account-b", customerName: "Ari", totalCents: 1200, internalNotes: "private" }; },
      async getShippingEstimate() { unauthorizedCalls.push("shipping"); return { arrivalDate: "2026-07-20" }; },
      async getRefundPolicy() { unauthorizedCalls.push("policy"); return { refundable: true }; },
    };
    await expect(loadOrderRoute(unauthorizedApi, "order-1")).resolves.toEqual({ kind: "forbidden" });
    expect(unauthorizedCalls).toEqual(["viewer", "order"]);
  });

  test("fans out authorized secondary work and returns only public order data", async () => {
    const calls: string[] = [];
    const shipping = deferred<ShippingEstimate>();
    const policy = deferred<RefundPolicy>();
    const api: OrderRouteApi = {
      async getViewer() { calls.push("viewer"); return { id: "viewer-1", accountId: "account-a" }; },
      async getOrder(id) { calls.push(`order:${id}`); return { id, accountId: "account-a", customerName: "Ari", totalCents: 1200, internalNotes: "private" }; },
      getShippingEstimate(id) { calls.push(`shipping:${id}`); return shipping.promise; },
      getRefundPolicy(id) { calls.push(`policy:${id}`); return policy.promise; },
    };

    const route = loadOrderRoute(api, " order-1 ");
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.slice(0, 2)).toEqual(["viewer", "order:order-1"]);
    expect(new Set(calls.slice(2))).toEqual(new Set(["shipping:order-1", "policy:account-a"]));
    expect(calls).toHaveLength(4);

    shipping.resolve({ arrivalDate: "2026-07-20" });
    policy.resolve({ refundable: true });
    await expect(route).resolves.toEqual({
      kind: "ok",
      order: { id: "order-1", customerName: "Ari", totalCents: 1200 },
      shipping: { arrivalDate: "2026-07-20" },
      canRefund: true,
    });
  });

  test("preserves an original API error", async () => {
    const expected = new Error("session expired");
    const api: OrderRouteApi = {
      async getViewer() { throw expected; },
      async getOrder() { throw new Error("unexpected"); },
      async getShippingEstimate() { throw new Error("unexpected"); },
      async getRefundPolicy() { throw new Error("unexpected"); },
    };
    await expect(loadOrderRoute(api, "order-1")).rejects.toBe(expected);
  });
});
