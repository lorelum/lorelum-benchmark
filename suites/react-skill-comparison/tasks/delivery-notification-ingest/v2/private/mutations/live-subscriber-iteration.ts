const parse = (value: any) => {
  if (!value || typeof value !== "object" || !value.id || !value.deliveryId || !value.occurredAt || !value.details) return null;
  const detail = value.status === "picked_up" ? value.details.facility : value.status === "delivered" ? value.details.recipient : value.status === "failed" ? value.details.reason : null;
  const timestamp = Date.parse(value.occurredAt);
  return typeof detail === "string" && detail && Number.isFinite(timestamp) ? { ...value, detail, timestamp } : null;
};
export function createDeliveryNotificationIngestor() {
  const deliveries = new Map<string, any>(), order: string[] = [], ids = new Set<string>(), listeners = new Set<any>();
  const snapshot = () => order.map((id) => { const value = deliveries.get(id); return { deliveryId: value.deliveryId, status: value.status, occurredAt: value.occurredAt, detail: value.detail }; });
  return {
    ingest(value: unknown) { const event = parse(value); if (!event || ids.has(event.id)) return false; const current = deliveries.get(event.deliveryId); if (current && event.timestamp <= current.timestamp) return false; ids.add(event.id); if (!current) order.push(event.deliveryId); deliveries.set(event.deliveryId, event); const values = snapshot(); for (const listener of listeners) listener(values); return true; },
    getDeliveries() { return snapshot(); },
    subscribe(listener: any) { listeners.add(listener); let released = false; return () => { if (!released) { released = true; listeners.delete(listener); } }; },
  };
}
