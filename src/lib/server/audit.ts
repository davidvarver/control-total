import type { Prisma } from "@prisma/client";
import { getCurrentUser } from "./auth-store";
import { prisma } from "./prisma";
import { redactSensitive } from "./redact-sensitive";

export async function addAuditLog(input: {
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  organizationId?: string;
  userId?: string | null;
}) {
  const user = await getCurrentUser();
  const organizationId = input.organizationId ?? user?.organizationId;

  if (!organizationId) {
    return null;
  }

  return prisma.auditLog.create({
    data: {
      organizationId,
      userId: input.userId === undefined ? (user?.id ?? null) : input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: toJson(redactSensitive(input.before)),
      after: toJson(redactSensitive(input.after)),
    },
  });
}

export async function listAuditLogs(organizationId: string, limit = 100) {
  return prisma.auditLog.findMany({
    where: { organizationId },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
