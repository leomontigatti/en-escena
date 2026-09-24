import { count, eq, inArray, or } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  choreographies,
  dancers,
  payments,
  professors,
  seminarInscriptions,
  user,
} from "@/db/schema";
import { formatSpanishList } from "@/lib/shared/text-normalization";

export type DeleteAcademyResult =
  | { ok: true; academy: { id: string; name: string } }
  | { ok: false; message: string };

/**
 * Removes an academy that holds nothing, together with its user. The user row
 * is the root of the cascade — the academy and everything under it hangs off it
 * by foreign key — so the delete is issued there and the database does the rest
 * (PRD #1090).
 *
 * Emptiness is re-read inside the transaction that deletes, so a dancer or a
 * payment created between the operator opening the dialog and confirming it
 * still refuses. Withdrawn choreographies count: what the academy holds is what
 * would be destroyed, and a withdrawn row is still a row.
 */
export async function deleteEmptyAcademy(
  academyId: string,
): Promise<DeleteAcademyResult> {
  return await db.transaction(async (tx) => {
    const [academy] = await tx
      .select({
        id: academies.id,
        name: academies.name,
        userId: academies.userId,
      })
      .from(academies)
      .where(eq(academies.id, academyId))
      .limit(1);

    if (!academy) {
      throw new Response("No encontramos esa Academia.", { status: 404 });
    }

    const dancerIds = tx
      .select({ id: dancers.id })
      .from(dancers)
      .where(eq(dancers.academyId, academyId));
    const professorIds = tx
      .select({ id: professors.id })
      .from(professors)
      .where(eq(professors.academyId, academyId));

    const [
      dancerCount,
      professorCount,
      choreographyCount,
      seminarInscriptionCount,
      paymentCount,
    ] = await Promise.all([
      readTotal(
        tx
          .select({ total: count() })
          .from(dancers)
          .where(eq(dancers.academyId, academyId)),
      ),
      readTotal(
        tx
          .select({ total: count() })
          .from(professors)
          .where(eq(professors.academyId, academyId)),
      ),
      readTotal(
        tx
          .select({ total: count() })
          .from(choreographies)
          .where(eq(choreographies.academyId, academyId)),
      ),
      readTotal(
        tx
          .select({ total: count() })
          .from(seminarInscriptions)
          .where(
            or(
              inArray(seminarInscriptions.dancerId, dancerIds),
              inArray(seminarInscriptions.professorId, professorIds),
            ),
          ),
      ),
      readTotal(
        tx
          .select({ total: count() })
          .from(payments)
          .where(eq(payments.academyId, academyId)),
      ),
    ]);
    const held = [
      pluralize(dancerCount, "bailarín", "bailarines"),
      pluralize(professorCount, "profesor", "profesores"),
      pluralize(choreographyCount, "coreografía", "coreografías"),
      pluralize(
        seminarInscriptionCount,
        "inscripción a seminario",
        "inscripciones a seminarios",
      ),
      pluralize(paymentCount, "pago", "pagos"),
    ].filter((label): label is string => label !== null);

    if (held.length > 0) {
      return {
        ok: false,
        message: `No se puede eliminar la academia: tiene ${formatSpanishList(held)}.`,
      };
    }

    await tx.delete(user).where(eq(user.id, academy.userId));

    return { ok: true, academy: { id: academy.id, name: academy.name } };
  });
}

async function readTotal(query: Promise<{ total: number }[]>) {
  const [row] = await query;

  return row?.total ?? 0;
}

function pluralize(total: number, singular: string, plural: string) {
  if (total === 0) {
    return null;
  }

  return `${total} ${total === 1 ? singular : plural}`;
}
