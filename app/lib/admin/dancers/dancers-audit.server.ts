import { db } from "@/db";
import { administrativeAuditEntries } from "@/db/schema";

import type { AdministrativeDancerAuditEntryInput } from "@/lib/admin/dancers/dancers.server.types";

export async function createAdministrativeDancerAuditEntry(
  input: AdministrativeDancerAuditEntryInput,
) {
  await db.insert(administrativeAuditEntries).values({
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
