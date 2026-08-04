import { eq } from "drizzle-orm";

import { db } from "@/db";
import { dancers } from "@/db/schema";
import {
  findDancerForMutation,
  toDancerSnapshot,
} from "@/lib/admin/dancers/dancers.server.shared";

export async function verifyDancerIdentity(input: {
  adminUserId: string;
  dancerId: string;
  selectedEventId: string | null;
}) {
  const existingDancer = await findDancerForMutation({
    dancerId: input.dancerId,
    selectedEventId: input.selectedEventId,
  });

  if (!existingDancer) {
    throw new Response("No encontramos ese Bailarín.", { status: 404 });
  }

  if (existingDancer.identificationStatus !== "unverified") {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const [updatedDancer] = await db
    .update(dancers)
    .set({
      identityVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(dancers.id, existingDancer.id))
    .returning();
  const savedSnapshot = toDancerSnapshot(updatedDancer);

  return {
    ok: true as const,
    dancer: savedSnapshot,
  };
}
