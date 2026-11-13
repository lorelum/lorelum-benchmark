import { failure } from './errors.js';

export class MemoryOrders {
  constructor(orders) {
    this.orders = new Map(orders.map(({ id, paid }) => [id, { id, paid, refunded: 0 }]));
  }

  async find(id) {
    const order = this.orders.get(id);
    if (!order) throw failure('ORDER_NOT_FOUND');
    return { ...order };
  }

  async save(order) {
    this.orders.set(order.id, { ...order });
  }
}
