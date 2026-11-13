const terminalStatuses = new Set(['cancelled', 'expired', 'delivered', 'returned']);

/** UI guard only; Firestore rules independently enforce these invariants. */
export function canTransitionOrder(
  order: { status: string; paymentStatus: string },
  target: string,
): boolean {
  if (target === order.status) return true;
  return order.paymentStatus !== 'refunded' && !terminalStatuses.has(order.status);
}
