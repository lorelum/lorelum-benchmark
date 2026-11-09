import { MemoryOrders } from './orders.js';
import { RefundService } from './refund-service.js';

export function createLedger(orders) {
  return new RefundService(new MemoryOrders(orders));
}
