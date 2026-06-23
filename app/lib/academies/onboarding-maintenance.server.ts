import { and, asc, eq, isNull, lt, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { academies, user } from "@/db/schema";

export type IncompleteAcademyOnboardingUser = {
  createdAt: Date;
  email: string;
  userId: string;
};

export async function listIncompleteAcademyOnboardingUsers(input?: {
  createdBefore?: Date;
}) {
  const filters: SQL[] = [
    eq(user.role, "academy"),
    eq(user.emailVerified, true),
    isNull(academies.id),
  ];

  if (input?.createdBefore) {
    filters.push(lt(user.createdAt, input.createdBefore));
  }

  return await db
    .select({
      createdAt: user.createdAt,
      email: user.email,
      userId: user.id,
    })
    .from(user)
    .leftJoin(academies, eq(academies.userId, user.id))
    .where(and(...filters))
    .orderBy(asc(user.createdAt), asc(user.email));
}
