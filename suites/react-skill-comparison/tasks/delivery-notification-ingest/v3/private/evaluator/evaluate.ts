import { expect } from "bun:test";
import { pathToFileURL } from "node:url";
import { evaluateV2 } from "../../../../../../../src/benchmark/evaluator/v2/harness";

const pickedUp = (id: string, deliveryId: string, occurredAt: string, facility = "North depot") => ({ id, deliveryId, status: "picked_up", occurredAt, details: { facility } });
const delivered = (id: string, deliveryId: string, occurredAt: string, recipient = "Mira") => ({ id, deliveryId, status: "delivered", occurredAt, details: { recipient } });

async function factory(path: string) {
  return (await import(`${pathToFileURL(path).href}?run=${Date.now()}`) as typeof import("../reference/src/delivery-notifications")).createDeliveryNotificationIngestor;
}

export async function evaluateCandidate({ candidatePath }: { candidatePath: string }) {
  const create = await factory(candidatePath);
  return evaluateV2([
    {
      id: "invalid-values-do-not-mutate-or-notify",
      run() {
        const ingestor = create();
        let notifications = 0;
        ingestor.subscribe(() => { notifications += 1; });
        expect(ingestor.ingest(null)).toBeFalse();
        expect(ingestor.ingest({ id: "one", deliveryId: "delivery-a", status: "unknown", occurredAt: "2026-01-01T10:00:00Z", details: {} })).toBeFalse();
        expect(ingestor.ingest({ id: "two", deliveryId: "delivery-a", status: "picked_up", occurredAt: "not-a-date", details: { facility: "North" } })).toBeFalse();
        expect(ingestor.ingest({ id: "three", deliveryId: "delivery-a", status: "delivered", occurredAt: "2026-01-01T10:00:00Z", details: { facility: "North" } })).toBeFalse();
        expect(ingestor.getDeliveries()).toEqual([]);
        expect(notifications).toBe(0);
      },
    },
    {
      id: "updates-by-instant-and-first-delivery-order",
      run() {
        const ingestor = create();
        expect(ingestor.ingest(pickedUp("one", "delivery-a", "2026-01-01T10:00:00+01:00"))).toBeTrue();
        expect(ingestor.ingest(pickedUp("two", "delivery-b", "2026-01-01T10:15:00Z", "South depot"))).toBeTrue();
        expect(ingestor.ingest(delivered("three", "delivery-a", "2026-01-01T09:30:00Z"))).toBeTrue();
        expect(ingestor.ingest({ id: "one", deliveryId: "delivery-a", status: "failed", occurredAt: "2026-01-01T11:00:00Z", details: { reason: "duplicate" } })).toBeFalse();
        expect(ingestor.ingest({ id: "four", deliveryId: "delivery-a", status: "failed", occurredAt: "2026-01-01T08:30:00Z", details: { reason: "stale" } })).toBeFalse();
        expect(ingestor.getDeliveries()).toEqual([
          { deliveryId: "delivery-a", status: "delivered", occurredAt: "2026-01-01T09:30:00Z", detail: "Mira" },
          { deliveryId: "delivery-b", status: "picked_up", occurredAt: "2026-01-01T10:15:00Z", detail: "South depot" },
        ]);
      },
    },
    {
      id: "snapshots-and-release-are-safe",
      run() {
        const ingestor = create();
        let notifications = 0;
        const release = ingestor.subscribe(() => { notifications += 1; });
        expect(ingestor.ingest(pickedUp("one", "delivery-a", "2026-01-01T10:00:00Z"))).toBeTrue();
        const snapshot = ingestor.getDeliveries() as Array<{ detail: string; deliveryId: string; status: "failed"; occurredAt: string }>;
        snapshot[0]!.detail = "tampered";
        snapshot.push({ deliveryId: "delivery-x", status: "failed", occurredAt: "2026-01-01T10:00:00Z", detail: "tampered" });
        expect(ingestor.getDeliveries()).toEqual([{ deliveryId: "delivery-a", status: "picked_up", occurredAt: "2026-01-01T10:00:00Z", detail: "North depot" }]);
        release();
        release();
        expect(ingestor.ingest({ id: "two", deliveryId: "delivery-a", status: "failed", occurredAt: "2026-01-01T11:00:00Z", details: { reason: "damaged" } })).toBeTrue();
        expect(notifications).toBe(1);
      },
    },
  ], [
    {
      id: "unknown-status-short-circuits-detail-access",
      maxPoints: 50,
      run() {
        const ingestor = create();
        let detailReads = 0;
        const invalid = { id: "unknown", deliveryId: "delivery-a", status: "unknown", occurredAt: "2026-01-01T10:00:00Z" } as Record<string, unknown>;
        Object.defineProperty(invalid, "details", { enumerable: true, get() { detailReads += 1; return { facility: "North depot" }; } });
        return ingestor.ingest(invalid) === false && detailReads === 0 ? 50 : 0;
      },
    },
    {
      id: "subscriber-delivery-uses-a-snapshot",
      maxPoints: 50,
      run() {
        const ingestor = create();
        const first: string[] = [];
        const second: string[] = [];
        ingestor.subscribe((deliveries) => {
          first.push(deliveries.map((delivery) => delivery.status).join(","));
          if (first.length === 1) ingestor.subscribe((next) => second.push(next.map((delivery) => delivery.status).join(",")));
        });
        ingestor.ingest(pickedUp("one", "delivery-a", "2026-01-01T10:00:00Z"));
        ingestor.ingest(delivered("two", "delivery-a", "2026-01-01T11:00:00Z"));
        return first.join("|") === "picked_up|delivered" && second.join("|") === "delivered" ? 50 : 0;
      },
    },
  ]);
}
