import { eq } from "drizzle-orm";

import { db } from "@/db";
import { dancers } from "@/db/schema";
import { createAdministrativeDancerAuditEntry } from "@/lib/admin/dancers/dancers-audit.server";
import {
  findAdministrativeDancerForMutation,
  toDancerSnapshot,
} from "@/lib/admin/dancers/dancers.server.shared";
import { buildDancerEventParticipationSql } from "@/lib/people/participation.server";

export async function verifyAdministrativeDancerIdentity(input: {
  adminUserId: string;
  dancerId: string;
  selectedEventId: string | null;
}) {
  const existingDancer = await findAdministrativeDancerForMutation({
    dancerId: input.dancerId,
    participationSql: buildDancerEventParticipationSql(input.selectedEventId),
    selectedEventId: input.selectedEventId,
  });

  if (!existingDancer) {
    throw new Response("No encontramos ese Bailarín.", { status: 404 });
  }

  if (existingDancer.identificationStatus !== "unverified") {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const beforeValues = toDancerSnapshot(existingDancer);
  const [updatedDancer] = await db
    .update(dancers)
    .set({
      identityVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dancers.id, existingDancer.id))
    .returning();
  const afterValues = toDancerSnapshot(updatedDancer);

  await createAdministrativeDancerAuditEntry({
    action: "verify-identity",
    adminUserId: input.adminUserId,
    afterValues,
    beforeValues,
    dancerId: existingDancer.id,
    eventId: input.selectedEventId,
    reason: null,
  });

  return {
    ok: true as const,
    dancer: afterValues,
  };
}
