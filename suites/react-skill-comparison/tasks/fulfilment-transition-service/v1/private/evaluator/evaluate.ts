import { expect } from "bun:test";
import { pathToFileURL } from "node:url";
import { evaluateV2 } from "../../../../../../../src/benchmark/evaluator/v2/harness";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

async function factory(path: string) {
  return (await import(`${pathToFileURL(path).href}?run=${Date.now()}`) as typeof import("../reference/src/fulfilment-service")).createFulfilmentService;
}

export async function evaluateCandidate({ candidatePath }: { candidatePath: string }) {
  const create = await factory(candidatePath);
  return evaluateV2([
    {
      id: "invalid-and-terminal-commands-are-no-ops",
      async run() {
        let calls = 0;
        const cause = new Error("carrier unavailable");
        const service = create("order-a", { dispatch: async () => { calls += 1; throw cause; } });
        expect(await service.dispatch()).toBeNull();
        expect(service.fulfil()).toBeFalse();
        expect(service.getOrder()).toEqual({ id: "order-a", status: "draft" });
        expect(service.reserve()).toBeTrue();
        expect(service.reserve()).toBeFalse();
        await expect(service.dispatch()).rejects.toBe(cause);
        expect(service.getOrder().status).toBe("failed");
        expect(service.getOrder().failure).toBe(cause);
        expect(service.reserve()).toBeFalse();
        expect(service.fulfil()).toBeFalse();
        expect(await service.dispatch()).toBeNull();
        expect(calls).toBe(1);
      },
    },
    {
      id: "successful-lifecycle-and-snapshot-safety",
      async run() {
        let calls = 0;
        const service = create("order-b", { dispatch: async (id: string) => { calls += 1; return `track:${id}`; } });
        expect(service.reserve()).toBeTrue();
        expect(await service.dispatch()).toBe("track:order-b");
        expect(service.getOrder()).toEqual({ id: "order-b", status: "dispatched", trackingCode: "track:order-b" });
        const snapshot = service.getOrder();
        snapshot.status = "failed";
        expect(service.getOrder().status).toBe("dispatched");
        expect(service.fulfil()).toBeTrue();
        expect(service.getOrder()).toEqual({ id: "order-b", status: "fulfilled", trackingCode: "track:order-b" });
        expect(calls).toBe(1);
      },
    },
  ], [
    {
      id: "concurrent-dispatches-share-one-carrier-request",
      maxPoints: 50,
      async run() {
        let calls = 0;
        const pending = deferred<string>();
        const service = create("order-c", { dispatch: () => { calls += 1; return pending.promise; } });
        service.reserve();
        const first = service.dispatch();
        const second = service.dispatch();
        pending.resolve("track:order-c");
        const values = await Promise.all([first, second]);
        return calls === 1 && values[0] === "track:order-c" && values[1] === "track:order-c" ? 50 : 0;
      },
    },
    {
      id: "pending-dispatch-is-not-provisionally-successful",
      maxPoints: 50,
      async run() {
        const pending = deferred<string>();
        const service = create("order-d", { dispatch: () => pending.promise });
        service.reserve();
        const dispatch = service.dispatch();
        const before = service.getOrder();
        pending.resolve("track:order-d");
        await dispatch;
        const after = service.getOrder();
        return before.status === "dispatching" && before.trackingCode === undefined && after.status === "dispatched" && after.trackingCode === "track:order-d" ? 50 : 0;
      },
    },
  ]);
}
