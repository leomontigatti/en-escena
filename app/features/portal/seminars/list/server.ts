import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { getPortalActiveEventContext } from "@/lib/portal/event-context.server";
import { listSeminarInscriptionsForAcademy } from "@/lib/seminars/inscription-rosters.server";
import { listSeminars } from "@/lib/seminars/repository.server";
import {
  createDefaultSeminarPictureStorage,
  loadSeminarInstructorPictureUrl,
} from "@/lib/storage/seminar-pictures.server";

import type { PortalSeminarCard, PortalSeminarsListLoaderData } from "./shared";

/**
 * The gallery is read-only: it counts what the academy registered and links to
 * each seminar's detail, where registration and removal happen. Nothing here
 * reads a price, a deposit or the seminar's occupancy — a started seminar's
 * poster is identical to an open one.
 */
export async function loadPortalSeminarsList(
  request: Request,
): Promise<PortalSeminarsListLoaderData> {
  const { academy } = await requireAcademyUser(request);
  const { activeEvent } = await getPortalActiveEventContext(request);

  if (!activeEvent) {
    return { hasActiveEvent: false, seminars: [] };
  }

  const [seminars, inscriptions] = await Promise.all([
    listSeminars(activeEvent.id),
    listSeminarInscriptionsForAcademy({
      academyId: academy.id,
      eventId: activeEvent.id,
    }),
  ]);
  const storage = createDefaultSeminarPictureStorage();

  const cards = await Promise.all(
    seminars.map(async (seminar): Promise<PortalSeminarCard> => {
      return {
        id: seminar.id,
        instructorName: seminar.instructorName,
        instructorPictureUrl: await loadSeminarInstructorPictureUrl({
          instructorPictureStorageKey: seminar.instructorPictureStorageKey,
          storage,
        }),
        scheduledDate: seminar.scheduledDate,
        startTime: seminar.startTime,
        inscriptionCount: inscriptions.filter(
          (inscription) => inscription.seminarId === seminar.id,
        ).length,
      };
    }),
  );

  return { hasActiveEvent: true, seminars: cards };
}
