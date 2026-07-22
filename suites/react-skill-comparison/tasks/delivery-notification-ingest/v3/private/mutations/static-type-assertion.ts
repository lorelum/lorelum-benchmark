export function createDeliveryNotificationIngestor() {
  const deliveries: any[] = [];
  const listeners = new Set<any>();
  return {
    ingest(value: any) { const event = value as any; deliveries.push({ deliveryId: event.deliveryId, status: event.status, occurredAt: event.occurredAt, detail: event.details?.facility ?? event.details?.recipient ?? event.details?.reason }); for (const listener of listeners) listener(deliveries); return true; },
    getDeliveries() { return deliveries; },
    subscribe(listener: any) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
