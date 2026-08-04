import { eq } from "drizzle-orm";

import { db } from "@/db";
import { dancers } from "@/db/schema";
import {
  findDancerForMutation,
  toDancerSnapshot,
} from "@/lib/admin/dancers/dancers.server.shared";
import type { DancerStatusMutationResult } from "@/lib/admin/dancers/dancers.server.types";

export async function setDancerActiveState(input: {
  action: "archive" | "reactivate";
  adminUserId: string;
  dancerId: string;
  selectedEventId: string | null;
}): Promise<DancerStatusMutationResult> {
  const existingDancer = await findDancerForMutation({
    dancerId: input.dancerId,
    selectedEventId: input.selectedEventId,
  });

  if (!existingDancer) {
    throw new Response("No encontramos ese Bailarín.", { status: 404 });
  }

  const nextActive = input.action === "reactivate";
  const [updatedDancer] = await db
    .update(dancers)
    .set({
      active: nextActive,
      updatedAt: new Date(),
    })
    .where(eq(dancers.id, existingDancer.id))
    .returning();
  const savedSnapshot = toDancerSnapshot(updatedDancer);

  return {
    dancer: savedSnapshot,
  };
}
