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

type ParsedNotification = DeliveryState & { id: string; occurredAtMilliseconds: number };

function nonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseNotification(value: unknown): ParsedNotification | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const notification = value as Record<string, unknown>;
  if (!nonemptyString(notification.id) || !nonemptyString(notification.deliveryId) || !nonemptyString(notification.occurredAt)) return null;
  const occurredAtMilliseconds = Date.parse(notification.occurredAt);
  if (!Number.isFinite(occurredAtMilliseconds)) return null;

  const status = notification.status;
  if (status !== "picked_up" && status !== "delivered" && status !== "failed") return null;
  const details = notification.details;
  if (details === null || typeof details !== "object" || Array.isArray(details)) return null;
  const detailRecord = details as Record<string, unknown>;
  const detail = status === "picked_up" ? detailRecord.facility : status === "delivered" ? detailRecord.recipient : detailRecord.reason;
  if (!nonemptyString(detail)) return null;
  return { id: notification.id, deliveryId: notification.deliveryId, status, occurredAt: notification.occurredAt, detail, occurredAtMilliseconds };
}

export function createDeliveryNotificationIngestor(): DeliveryNotificationIngestor {
  const deliveries = new Map<string, ParsedNotification>();
  const deliveryOrder: string[] = [];
  const acceptedIds = new Set<string>();
  const listeners = new Set<(deliveries: readonly DeliveryState[]) => void>();

  const snapshot = (): readonly DeliveryState[] => deliveryOrder.map((deliveryId) => {
    const delivery = deliveries.get(deliveryId)!;
    return { deliveryId: delivery.deliveryId, status: delivery.status, occurredAt: delivery.occurredAt, detail: delivery.detail };
  });
  const notify = () => {
    const deliveriesSnapshot = snapshot();
    for (const listener of [...listeners]) listener(deliveriesSnapshot);
  };

  return {
    ingest(value) {
      const notification = parseNotification(value);
      if (!notification || acceptedIds.has(notification.id)) return false;
      const current = deliveries.get(notification.deliveryId);
      if (current && notification.occurredAtMilliseconds <= current.occurredAtMilliseconds) return false;

      acceptedIds.add(notification.id);
      if (!current) deliveryOrder.push(notification.deliveryId);
      deliveries.set(notification.deliveryId, notification);
      notify();
      return true;
    },
    getDeliveries() {
      return snapshot();
    },
    subscribe(listener) {
      listeners.add(listener);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        listeners.delete(listener);
      };
    },
  };
}
