import type { LockMode, Subscription } from "./types";

export function resolveSubscriptionAccess(
  subscription: Subscription,
  at: Date = new Date(),
): {
  status: Subscription["status"];
  lockMode: LockMode;
  graceUntil: Date;
  isLocked: boolean;
  canWrite: boolean;
} {
  const expiresAt = new Date(subscription.expiresAt);
  const graceUntil = new Date(expiresAt);
  graceUntil.setDate(graceUntil.getDate() + subscription.graceDays);

  if (
    subscription.manualOverrideUntil &&
    new Date(subscription.manualOverrideUntil) >= at
  ) {
    return {
      status: "active",
      lockMode: "none",
      graceUntil,
      isLocked: false,
      canWrite: true,
    };
  }

  if (subscription.status === "suspended" || subscription.status === "cancelled") {
    return {
      status: subscription.status,
      lockMode: subscription.lockMode,
      graceUntil,
      isLocked: subscription.lockMode !== "none",
      canWrite: subscription.lockMode === "none",
    };
  }

  if (at <= expiresAt) {
    return {
      status: "active",
      lockMode: "none",
      graceUntil,
      isLocked: false,
      canWrite: true,
    };
  }

  if (at <= graceUntil) {
    return {
      status: "grace",
      lockMode: "none",
      graceUntil,
      isLocked: false,
      canWrite: true,
    };
  }

  return {
    status: "suspended",
    lockMode: subscription.lockMode,
    graceUntil,
    isLocked: subscription.lockMode !== "none",
    canWrite: subscription.lockMode === "none",
  };
}
