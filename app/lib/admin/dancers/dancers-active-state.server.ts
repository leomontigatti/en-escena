import { eq } from "drizzle-orm";

import { db } from "@/db";
import { dancers } from "@/db/schema";
import { createAdministrativeDancerAuditEntry } from "@/lib/admin/dancers/dancers-audit.server";
import {
  findAdministrativeDancerForMutation,
  toDancerSnapshot,
} from "@/lib/admin/dancers/dancers.server.shared";
import type { AdministrativeDancerStatusMutationResult } from "@/lib/admin/dancers/dancers.server.types";

export async function setAdministrativeDancerActiveState(input: {
  action: "archive" | "reactivate";
  adminUserId: string;
  dancerId: string;
  selectedEventId: string | null;
}): Promise<AdministrativeDancerStatusMutationResult> {
  const existingDancer = await findAdministrativeDancerForMutation({
    dancerId: input.dancerId,
    selectedEventId: input.selectedEventId,
  });

  if (!existingDancer) {
    throw new Response("No encontramos ese Bailarín.", { status: 404 });
  }

  const nextActive = input.action === "reactivate";
  const beforeValues = toDancerSnapshot(existingDancer);
  const [updatedDancer] = await db
    .update(dancers)
    .set({
      active: nextActive,
      updatedAt: new Date(),
    })
    .where(eq(dancers.id, existingDancer.id))
    .returning();
  const afterValues = toDancerSnapshot(updatedDancer);

  await createAdministrativeDancerAuditEntry({
    action: input.action,
    adminUserId: input.adminUserId,
    afterValues,
    beforeValues,
    dancerId: existingDancer.id,
    eventId: input.selectedEventId,
    reason: null,
  });

  return {
    dancer: afterValues,
  };
}
