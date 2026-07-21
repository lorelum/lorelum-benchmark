import type { DeliveryNotificationIngestor, DeliveryState, DeliveryStatus } from "../reference/src/delivery-notifications";

export function createDeliveryNotificationIngestor(): DeliveryNotificationIngestor {
  const deliveries = new Map<string, DeliveryState>();
  const listeners = new Set<(deliveries: readonly DeliveryState[]) => void>();
  return {
    ingest(value) {
      const event = value as { id: string; deliveryId: string; status: DeliveryStatus; occurredAt: string; details: Record<string, string> };
      const detail = event.details.facility ?? event.details.recipient ?? event.details.reason;
      deliveries.set(event.deliveryId, { deliveryId: event.deliveryId, status: event.status, occurredAt: event.occurredAt, detail });
      const snapshot = [...deliveries.values()];
      for (const listener of listeners) listener(snapshot);
      return true;
    },
    getDeliveries() { return [...deliveries.values()]; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
