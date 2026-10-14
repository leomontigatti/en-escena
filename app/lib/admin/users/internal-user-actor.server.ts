import { eq } from "drizzle-orm";

import { db } from "@/db";
import { user } from "@/db/schema";
import { canWriteInAdminPanel } from "@/lib/auth/user-role.shared";

/**
 * Whether the user acting on an internal user may write in administration.
 * The services ask it again behind the route guard, so a caller that skips
 * the guard is still refused.
 */
export async function canUserWriteInAdminPanel(userId: string) {
  const actor = await db.query.user.findFirst({
    columns: { role: true },
    where: eq(user.id, userId),
  });

  return actor !== undefined && canWriteInAdminPanel(actor.role);
}
