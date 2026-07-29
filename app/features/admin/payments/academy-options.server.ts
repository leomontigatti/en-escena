import { asc } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";

export async function listPaymentAcademyOptions() {
  return await db.query.academies.findMany({
    columns: {
      contactName: true,
      id: true,
      name: true,
    },
    orderBy: [asc(academies.name)],
  });
}
