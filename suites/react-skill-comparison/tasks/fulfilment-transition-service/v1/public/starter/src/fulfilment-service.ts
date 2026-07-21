export type OrderStatus = "draft" | "reserved" | "dispatching" | "dispatched" | "fulfilled" | "failed";
export interface Order { id: string; status: OrderStatus; trackingCode?: string; failure?: unknown; }
export interface Carrier { dispatch(orderId: string): Promise<string>; }
export interface FulfilmentService { reserve(): boolean; dispatch(): Promise<string | null>; fulfil(): boolean; getOrder(): Order; }

export function createFulfilmentService(orderId: string, carrier: Carrier): FulfilmentService {
  let order: Order = { id: orderId, status: "draft" };
  return {
    reserve() { order.status = "reserved"; return true; },
    async dispatch() { const trackingCode = await carrier.dispatch(order.id); order.status = "dispatched"; order.trackingCode = trackingCode; return trackingCode; },
    fulfil() { order.status = "fulfilled"; return true; },
    getOrder() { return order; },
  };
}
