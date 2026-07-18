export interface Viewer {
  id: string;
  accountId: string;
}

export interface Order {
  id: string;
  accountId: string;
  customerName: string;
  totalCents: number;
  internalNotes: string;
}

export interface ShippingEstimate {
  arrivalDate: string;
}

export interface RefundPolicy {
  refundable: boolean;
}

export interface OrderRouteApi {
  getViewer(): Promise<Viewer>;
  getOrder(orderId: string): Promise<Order>;
  getShippingEstimate(orderId: string): Promise<ShippingEstimate>;
  getRefundPolicy(accountId: string): Promise<RefundPolicy>;
}

export type OrderRouteResult =
  | { kind: "not-found" }
  | { kind: "forbidden" }
  | {
      kind: "ok";
      order: { id: string; customerName: string; totalCents: number };
      shipping: ShippingEstimate;
      canRefund: boolean;
    };

export async function loadOrderRoute(api: OrderRouteApi, orderId: string): Promise<OrderRouteResult> {
  const normalizedOrderId = orderId.trim();
  if (!normalizedOrderId) return { kind: "not-found" };

  const viewer = await api.getViewer();
  const order = await api.getOrder(normalizedOrderId);
  if (viewer.accountId !== order.accountId) return { kind: "forbidden" };

  const shipping = await api.getShippingEstimate(order.id);
  const refundPolicy = await api.getRefundPolicy(viewer.accountId);
  return {
    kind: "ok",
    order: {
      id: order.id,
      customerName: order.customerName,
      totalCents: order.totalCents,
    },
    shipping,
    canRefund: refundPolicy.refundable,
  };
}
