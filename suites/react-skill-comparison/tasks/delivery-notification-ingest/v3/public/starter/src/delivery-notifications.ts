export type DeliveryStatus = "picked_up" | "delivered" | "failed";

export interface DeliveryState {
  deliveryId: string;
  status: DeliveryStatus;
  occurredAt: string;
  detail: string;
}

export interface DeliveryNotificationIngestor {
  ingest(value: unknown): boolean;
  getDeliveries(): readonly DeliveryState[];
  subscribe(listener: (deliveries: readonly DeliveryState[]) => void): () => void;
}

export function createDeliveryNotificationIngestor(): DeliveryNotificationIngestor {
  const deliveries: DeliveryState[] = [];
  const listeners = new Set<(deliveries: readonly DeliveryState[]) => void>();

  return {
    ingest(value) {
      const event = value as { deliveryId: string; status: DeliveryStatus; occurredAt: string; detail: string };
      deliveries.push({
        deliveryId: event.deliveryId,
        status: event.status,
        occurredAt: event.occurredAt,
        detail: event.detail,
      });
      for (const listener of listeners) listener(deliveries);
      return true;
    },
    getDeliveries() {
      return deliveries;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
