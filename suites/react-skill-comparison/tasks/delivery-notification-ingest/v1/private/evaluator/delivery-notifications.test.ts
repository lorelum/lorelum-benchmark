import { describe, expect, test } from "bun:test";

interface DeliveryState {
  deliveryId: string;
  status: "picked_up" | "delivered" | "failed";
  occurredAt: string;
  detail: string;
}

interface DeliveryNotificationIngestor {
  ingest(value: unknown): boolean;
  getDeliveries(): readonly DeliveryState[];
  subscribe(listener: (deliveries: readonly DeliveryState[]) => void): () => void;
}

interface DeliveryNotificationsModule {
  createDeliveryNotificationIngestor(): DeliveryNotificationIngestor;
}

const candidatePath = Bun.env.CANDIDATE_PATH ?? "suites/react-skill-comparison/tasks/delivery-notification-ingest/v1/public/starter/src/delivery-notifications.ts";
const candidateUrl = `${Bun.pathToFileURL(candidatePath).href}?run=${Date.now()}`;
const { createDeliveryNotificationIngestor } = (await import(candidateUrl)) as DeliveryNotificationsModule;

const pickedUp = (id: string, deliveryId: string, occurredAt: string, facility = "North depot") => ({
  id,
  deliveryId,
  status: "picked_up",
  occurredAt,
  details: { facility },
});

describe("delivery-notification-ingest-v1", () => {
  test("rejects malformed external values without mutation or notification", () => {
    const ingestor = createDeliveryNotificationIngestor();
    let notifications = 0;
    ingestor.subscribe(() => { notifications += 1; });

    expect(ingestor.ingest(null)).toBeFalse();
    expect(ingestor.ingest({ id: "one", deliveryId: "delivery-1", status: "unknown", occurredAt: "2026-01-01T10:00:00Z", details: {} })).toBeFalse();
    expect(ingestor.ingest({ id: "two", deliveryId: "delivery-1", status: "picked_up", occurredAt: "not-a-date", details: { facility: "North" } })).toBeFalse();
    expect(ingestor.ingest({ id: "three", deliveryId: "delivery-1", status: "delivered", occurredAt: "2026-01-01T10:00:00Z", details: { facility: "North" } })).toBeFalse();
    expect(ingestor.getDeliveries()).toEqual([]);
    expect(notifications).toBe(0);
  });

  test("keeps first delivery order, rejects duplicate IDs, and compares instants", () => {
    const ingestor = createDeliveryNotificationIngestor();
    const traces: string[] = [];
    ingestor.subscribe((deliveries) => traces.push(deliveries.map((delivery) => `${delivery.deliveryId}:${delivery.status}`).join(",")));

    expect(ingestor.ingest(pickedUp("one", "delivery-a", "2026-01-01T10:00:00+01:00"))).toBeTrue();
    expect(ingestor.ingest(pickedUp("two", "delivery-b", "2026-01-01T10:15:00Z", "South depot"))).toBeTrue();
    expect(ingestor.ingest({ id: "three", deliveryId: "delivery-a", status: "delivered", occurredAt: "2026-01-01T09:30:00Z", details: { recipient: "Mira" } })).toBeTrue();
    expect(ingestor.ingest({ id: "one", deliveryId: "delivery-a", status: "failed", occurredAt: "2026-01-01T11:00:00Z", details: { reason: "duplicate" } })).toBeFalse();
    expect(ingestor.ingest({ id: "four", deliveryId: "delivery-a", status: "failed", occurredAt: "2026-01-01T08:30:00Z", details: { reason: "stale" } })).toBeFalse();

    expect(ingestor.getDeliveries()).toEqual([
      { deliveryId: "delivery-a", status: "delivered", occurredAt: "2026-01-01T09:30:00Z", detail: "Mira" },
      { deliveryId: "delivery-b", status: "picked_up", occurredAt: "2026-01-01T10:15:00Z", detail: "South depot" },
    ]);
    expect(traces).toEqual(["delivery-a:picked_up", "delivery-a:picked_up,delivery-b:picked_up", "delivery-a:delivered,delivery-b:picked_up"]);
  });

  test("returns immutable snapshots and releases subscribers idempotently", () => {
    const ingestor = createDeliveryNotificationIngestor();
    let notifications = 0;
    const release = ingestor.subscribe(() => { notifications += 1; });

    expect(ingestor.ingest(pickedUp("one", "delivery-a", "2026-01-01T10:00:00Z"))).toBeTrue();
    const snapshot = ingestor.getDeliveries() as DeliveryState[];
    snapshot[0]!.detail = "tampered";
    snapshot.push({ deliveryId: "delivery-x", status: "failed", occurredAt: "2026-01-01T10:00:00Z", detail: "tampered" });
    expect(ingestor.getDeliveries()).toEqual([{ deliveryId: "delivery-a", status: "picked_up", occurredAt: "2026-01-01T10:00:00Z", detail: "North depot" }]);

    release();
    release();
    expect(ingestor.ingest({ id: "two", deliveryId: "delivery-a", status: "failed", occurredAt: "2026-01-01T11:00:00Z", details: { reason: "damaged" } })).toBeTrue();
    expect(notifications).toBe(1);
  });
});
