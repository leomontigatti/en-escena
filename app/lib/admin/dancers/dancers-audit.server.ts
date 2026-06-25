import { db } from "@/db";
import { administrativeAuditEntries } from "@/db/schema";

import type { AdministrativeDancerAuditEntryInput } from "@/lib/admin/dancers/dancers.server.types";

type AuditExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function createAdministrativeDancerAuditEntry(
  input: AdministrativeDancerAuditEntryInput & {
    executor?: AuditExecutor;
  },
) {
  const executor = input.executor ?? db;

  await executor.insert(administrativeAuditEntries).values({
    entityType: "dancer",
    entityId: input.dancerId,
    eventId: input.eventId,
    adminUserId: input.adminUserId,
    action: input.action,
    reason: input.reason,
    beforeValues: input.beforeValues,
    afterValues: input.afterValues,
  });
}
