import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";

/**
 * The academy a finance screen is about, with the contact block every one of
 * them carries. It is one reader for the three screens — the academy's list and
 * the two financial details — because the 404 is part of the answer: a screen
 * that resolved the academy its own way could refuse where another accepted.
 */
export async function readFinanceAcademy(academyId: string) {
  const academy = await db.query.academies.findFirst({
    columns: { contactName: true, id: true, name: true, phone: true },
    where: eq(academies.id, academyId),
  });

  if (!academy) {
    throw new Response("No encontramos esa academia.", { status: 404 });
  }

  return academy;
}

/** The academy id of a route that names one, or its 404. */
export function readFinanceAcademyId(params: { academyId?: string }) {
  if (!params.academyId) {
    throw new Response("No encontramos esa academia.", { status: 404 });
  }

  return params.academyId;
}
