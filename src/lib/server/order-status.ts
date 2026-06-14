export function isCancelledOrder(status: string | undefined | null) {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");

  return (
    normalized === "cancelled" ||
    normalized === "canceled" ||
    normalized === "cancelled_partially"
  );
}

export function needsCancelledBillingReview(order: {
  status: string;
  grossAmount: number;
  netReceivedAmount: number | null;
  billingStatus?: "confirmed" | "pending" | "error";
  charges: Array<{ amount: number }>;
}) {
  if (!isCancelledOrder(order.status)) {
    return false;
  }

  const charges = order.charges.reduce((sum, charge) => sum + charge.amount, 0);

  return (
    order.billingStatus !== "confirmed" ||
    order.netReceivedAmount === null ||
    order.netReceivedAmount !== 0 ||
    order.grossAmount !== 0 ||
    charges > 0
  );
}

