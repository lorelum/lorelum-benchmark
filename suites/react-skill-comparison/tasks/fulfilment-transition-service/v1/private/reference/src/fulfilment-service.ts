export type OrderStatus = "draft" | "reserved" | "dispatching" | "dispatched" | "fulfilled" | "failed";
export interface Order { id: string; status: OrderStatus; trackingCode?: string; failure?: unknown; }
export interface Carrier { dispatch(orderId: string): Promise<string>; }
export interface FulfilmentService { reserve(): boolean; dispatch(): Promise<string | null>; fulfil(): boolean; getOrder(): Order; }

export function createFulfilmentService(orderId: string, carrier: Carrier): FulfilmentService {
  let order: Order = { id: orderId, status: "draft" };
  let pendingDispatch: Promise<string> | undefined;

  return {
    reserve() {
      if (order.status !== "draft") return false;
      order = { id: order.id, status: "reserved" };
      return true;
    },
    dispatch() {
      if (order.status === "dispatching" && pendingDispatch) return pendingDispatch;
      if (order.status === "dispatched") return Promise.resolve(order.trackingCode!);
      if (order.status !== "reserved") return Promise.resolve(null);

      order = { id: order.id, status: "dispatching" };
      pendingDispatch = carrier.dispatch(order.id).then(
        (trackingCode) => {
          order = { id: order.id, status: "dispatched", trackingCode };
          return trackingCode;
        },
        (failure) => {
          order = { id: order.id, status: "failed", failure };
          throw failure;
        },
      );
      return pendingDispatch;
    },
    fulfil() {
      if (order.status !== "dispatched") return false;
      order = { id: order.id, status: "fulfilled", trackingCode: order.trackingCode };
      return true;
    },
    getOrder() {
      return { ...order };
    },
  };
}
