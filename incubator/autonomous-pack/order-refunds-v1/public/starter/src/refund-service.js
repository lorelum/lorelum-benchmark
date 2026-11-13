import { failure } from './errors.js';

export class RefundService {
  constructor(orders) {
    this.orders = orders;
  }

  async getOrder(id) {
    const order = await this.orders.find(id);
    return { ...order, remaining: order.paid - order.refunded };
  }

  async refund(orderId, requestId, amount) {
    const order = await this.orders.find(orderId);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw failure('INVALID_AMOUNT');
    if (order.refunded !== 0 || amount !== order.paid) throw failure('INSUFFICIENT_BALANCE');
    order.refunded = amount;
    await this.orders.save(order);
    return { orderId, requestId, amount, refunded: amount, remaining: 0 };
  }
}
