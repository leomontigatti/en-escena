import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  choreographies,
  comprobantes,
  events,
  seminars,
} from "@/db/schema";

import { readComprobanteAnchor, type ComprobanteAnchor } from "./anchor";
import type { ComprobanteAnchorReading } from "./anchor-reading";

/**
 * Everything a surface needs to say what one comprobante belongs to: the anchor
 * itself (the scope its `vigente`/`anulada` state is derived over), how that
 * anchor reads, and the academy and event around it.
 *
 * The academy comes off the **root's own column** and not off the choreography:
 * a seminar comprobante has no choreography to read it from, and on a
 * choreography one the column was backfilled from exactly that join, so the two
 * kinds cannot disagree about it.
 */
export type ComprobanteAnchorContext = {
  academyId: string;
  academyName: string;
  anchor: ComprobanteAnchor;
  eventName: string;
  reading: ComprobanteAnchorReading;
};

/**
 * The anchor context of one comprobante, or null when it does not exist. The two
 * anchor joins are LEFT joins because each row satisfies exactly one of them;
 * the `CHECK` on the root is what makes the branch below total.
 */
export async function readComprobanteAnchorContext(
  comprobanteId: string,
): Promise<ComprobanteAnchorContext | null> {
  const [row] = await db
    .select({
      academyId: academies.id,
      academyName: academies.name,
      choreographyId: comprobantes.choreographyId,
      choreographyName: choreographies.name,
      eventName: events.name,
      seminarId: comprobantes.seminarId,
      instructorName: seminars.instructorName,
      scheduledDate: seminars.scheduledDate,
    })
    .from(comprobantes)
    .innerJoin(academies, eq(comprobantes.academyId, academies.id))
    .innerJoin(events, eq(comprobantes.eventId, events.id))
    .leftJoin(
      choreographies,
      eq(comprobantes.choreographyId, choreographies.id),
    )
    .leftJoin(seminars, eq(comprobantes.seminarId, seminars.id))
    .where(eq(comprobantes.id, comprobanteId));

  if (!row) {
    return null;
  }

  return {
    academyId: row.academyId,
    academyName: row.academyName,
    anchor: readComprobanteAnchor({
      academyId: row.academyId,
      choreographyId: row.choreographyId,
      seminarId: row.seminarId,
    }),
    eventName: row.eventName,
    reading: readAnchorFromJoins(row),
  };
}

/**
 * The reading built from the joined columns. It is exported for the list, which
 * reads many rows in one query and cannot call the single-row loader per row.
 */
export function readAnchorFromJoins(row: {
  choreographyId: string | null;
  choreographyName: string | null;
  seminarId: string | null;
  instructorName: string | null;
  scheduledDate: string | null;
}): ComprobanteAnchorReading {
  return row.choreographyId !== null
    ? {
        kind: "choreography",
        choreographyId: row.choreographyId,
        choreographyName: row.choreographyName as string,
      }
    : {
        kind: "seminar",
        seminarId: row.seminarId as string,
        instructorName: row.instructorName as string,
        scheduledDate: row.scheduledDate as string,
      };
}
