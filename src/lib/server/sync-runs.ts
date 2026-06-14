import type { Channel, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export async function startSyncRun(input: {
  organizationId: string;
  marketplaceAccountId?: string;
  channel?: Channel;
  jobType: string;
  details?: Prisma.InputJsonValue;
}) {
  return prisma.syncRun.create({
    data: {
      organizationId: input.organizationId,
      marketplaceAccountId: input.marketplaceAccountId,
      channel: input.channel,
      jobType: input.jobType,
      status: "running",
      details: input.details,
    },
  });
}

export async function finishSyncRun(input: {
  id: string;
  status: "success" | "skipped" | "failed";
  startedAt: Date;
  checked?: number;
  imported?: number;
  pending?: number;
  total?: number;
  errorMessage?: string;
  details?: Prisma.InputJsonValue;
}) {
  const finishedAt = new Date();

  return prisma.syncRun.update({
    where: { id: input.id },
    data: {
      status: input.status,
      finishedAt,
      durationMs: finishedAt.getTime() - input.startedAt.getTime(),
      checked: input.checked ?? 0,
      imported: input.imported ?? 0,
      pending: input.pending ?? 0,
      total: input.total ?? 0,
      errorMessage: input.errorMessage,
      details: input.details,
    },
  });
}

export async function listRecentSyncRuns(organizationId: string, limit = 20) {
  return prisma.syncRun.findMany({
    where: { organizationId },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}

export async function getLatestSuccessfulSyncRun(input: {
  organizationId: string;
  marketplaceAccountId?: string;
  jobType: string;
}) {
  return prisma.syncRun.findFirst({
    where: {
      organizationId: input.organizationId,
      marketplaceAccountId: input.marketplaceAccountId,
      jobType: input.jobType,
      status: "success",
    },
    orderBy: { startedAt: "desc" },
  });
}
