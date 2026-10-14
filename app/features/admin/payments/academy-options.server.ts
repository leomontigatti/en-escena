import { asc } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { academyOwner } from "@/lib/academies/owner-kind.server";

export async function listPaymentAcademyOptions() {
  return await db.query.academies.findMany({
    columns: {
      contactName: true,
      id: true,
      name: true,
    },
    where: academyOwner(),
    orderBy: [asc(academies.name)],
  });
}
