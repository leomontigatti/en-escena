import { and, eq, max } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, presentations } from "@/db/schema";
import { notWithdrawnChoreography } from "@/lib/choreographies/withdrawn-choreography";
import {
  formatMusicFileName,
  getMusicFileExtension,
} from "@/lib/presentations/music-file-name";

/**
 * The name a choreography's music downloads under, or `null` when it has no
 * music. `orderNumber` is the number its reader may see: administration
 * always, the academy only once its day's program is published, as its
 * presentations page shows it (`readAcademyPresentations`).
 */
export async function readChoreographyMusicFileName(input: {
  academyName: string;
  choreography: { musicStorageKey: string | null; name: string };
  eventId: string;
  orderNumber: number | null;
}): Promise<string | null> {
  const { choreography, orderNumber } = input;

  if (choreography.musicStorageKey === null) {
    return null;
  }

  return formatMusicFileName({
    academyName: input.academyName,
    choreographyName: choreography.name,
    extension: getMusicFileExtension(choreography.musicStorageKey),
    order:
      orderNumber === null
        ? null
        : {
            highestOrderNumber: await readHighestOrderNumber(input.eventId),
            orderNumber,
          },
  });
}

/**
 * The archive's width: the event's presentations, a withdrawn one left out as
 * the program leaves it.
 */
async function readHighestOrderNumber(eventId: string) {
  const [row] = await db
    .select({ highestOrderNumber: max(presentations.orderNumber) })
    .from(presentations)
    .innerJoin(
      choreographies,
      eq(presentations.choreographyId, choreographies.id),
    )
    .where(and(eq(presentations.eventId, eventId), notWithdrawnChoreography()));

  return row?.highestOrderNumber ?? 0;
}
