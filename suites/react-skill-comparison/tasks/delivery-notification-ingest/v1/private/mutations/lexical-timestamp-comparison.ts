import type { DeliveryNotificationIngestor, DeliveryState, DeliveryStatus } from "../reference/src/delivery-notifications";

function parse(value: unknown): (DeliveryState & { id: string }) | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (typeof event.id !== "string" || !event.id || typeof event.deliveryId !== "string" || !event.deliveryId || typeof event.occurredAt !== "string" || !Number.isFinite(Date.parse(event.occurredAt))) return null;
  if (event.status !== "picked_up" && event.status !== "delivered" && event.status !== "failed") return null;
  if (event.details === null || typeof event.details !== "object" || Array.isArray(event.details)) return null;
  const details = event.details as Record<string, unknown>;
  const detail = event.status === "picked_up" ? details.facility : event.status === "delivered" ? details.recipient : details.reason;
  return typeof detail === "string" && detail.trim() ? { id: event.id, deliveryId: event.deliveryId, status: event.status as DeliveryStatus, occurredAt: event.occurredAt, detail } : null;
}

export function createDeliveryNotificationIngestor(): DeliveryNotificationIngestor {
  const deliveries = new Map<string, DeliveryState>();
  const order: string[] = [];
  const acceptedIds = new Set<string>();
  const listeners = new Set<(deliveries: readonly DeliveryState[]) => void>();
  const snapshot = () => order.map((id) => ({ ...deliveries.get(id)! }));
  return {
    ingest(value) {
      const event = parse(value);
      if (!event || acceptedIds.has(event.id)) return false;
      const current = deliveries.get(event.deliveryId);
      if (current && event.occurredAt <= current.occurredAt) return false;
      acceptedIds.add(event.id);
      if (!current) order.push(event.deliveryId);
      deliveries.set(event.deliveryId, event);
      const deliveriesSnapshot = snapshot();
      for (const listener of listeners) listener(deliveriesSnapshot);
      return true;
    },
    getDeliveries() { return snapshot(); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
