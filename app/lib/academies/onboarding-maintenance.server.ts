import { and, asc, eq, isNull, lt, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { academies, user } from "@/db/schema";

export type IncompleteAcademyOnboardingUser = {
  createdAt: Date;
  email: string;
  userId: string;
};

type IncompleteAcademyOnboardingFilters = {
  createdBefore?: Date;
};

export async function listIncompleteAcademyOnboardingUsers(
  filters: IncompleteAcademyOnboardingFilters = {},
): Promise<IncompleteAcademyOnboardingUser[]> {
  const queryConditions: SQL[] = [
    eq(user.role, "academy"),
    eq(user.emailVerified, true),
    isNull(academies.id),
  ];

  if (filters.createdBefore) {
    queryConditions.push(lt(user.createdAt, filters.createdBefore));
  }

  return await db
    .select({
      createdAt: user.createdAt,
      email: user.email,
      userId: user.id,
    })
    .from(user)
    .leftJoin(academies, eq(academies.userId, user.id))
    .where(and(...queryConditions))
    .orderBy(asc(user.createdAt), asc(user.email));
}
