import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { getPortalActiveEventContext } from "@/lib/portal/event-context.server";
import {
  listSeminarInscriptionsForAcademy,
  listSeminarPersonOptionsForAcademy,
  registerSeminarInscription,
  seminarInscriptionSuccessMessage,
} from "@/lib/seminars/inscriptions.server";
import { hasSeminarStarted } from "@/lib/seminars/registration-window";
import { listSeminars } from "@/lib/seminars/repository.server";
import {
  createDefaultSeminarPictureStorage,
  loadSeminarInstructorPictureUrl,
} from "@/lib/storage/seminar-pictures.server";

import {
  parseSeminarPersonValue,
  registerSeminarInscriptionIntent,
  type PortalSeminarCard,
  type PortalSeminarsActionData,
  type PortalSeminarsListLoaderData,
} from "./shared";

export async function loadPortalSeminarsList(
  request: Request,
): Promise<PortalSeminarsListLoaderData> {
  const { academy } = await requireAcademyUser(request);
  const { activeEvent } = await getPortalActiveEventContext(request);

  if (!activeEvent) {
    return { hasActiveEvent: false, seminars: [] };
  }

  const now = new Date();
  const [seminars, inscriptions, people] = await Promise.all([
    listSeminars(activeEvent.id),
    listSeminarInscriptionsForAcademy({
      academyId: academy.id,
      eventId: activeEvent.id,
    }),
    listSeminarPersonOptionsForAcademy(academy.id),
  ]);
  const storage = createDefaultSeminarPictureStorage();

  const cards = await Promise.all(
    seminars.map(async (seminar): Promise<PortalSeminarCard> => {
      const seminarInscriptions = inscriptions.filter(
        (inscription) => inscription.seminarId === seminar.id,
      );
      const registeredPersonIds = new Set(
        seminarInscriptions.map((inscription) => inscription.personId),
      );

      return {
        id: seminar.id,
        instructorName: seminar.instructorName,
        instructorPictureUrl: await loadSeminarInstructorPictureUrl({
          instructorPictureStorageKey: seminar.instructorPictureStorageKey,
          storage,
        }),
        scheduledDate: seminar.scheduledDate,
        startTime: seminar.startTime,
        hasStarted: hasSeminarStarted(seminar, now),
        // The card never says how many places are left; what it needs is
        // whether there is one, which is what turns the button into a reason.
        isFull: seminar.availablePlaces === 0,
        inscriptions: seminarInscriptions.map((inscription) => ({
          id: inscription.id,
          fullName: inscription.fullName,
        })),
        people: people.filter((person) => !registeredPersonIds.has(person.id)),
      };
    }),
  );

  return { hasActiveEvent: true, seminars: cards };
}

export async function handlePortalSeminarsListAction(
  request: Request,
): Promise<PortalSeminarsActionData> {
  const { academy } = await requireAcademyUser(request);
  const formData = await request.formData();

  if (formData.get("intent") !== registerSeminarInscriptionIntent) {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const { activeEvent } = await getPortalActiveEventContext(request);
  const person = parseSeminarPersonValue(String(formData.get("person") ?? ""));

  if (!activeEvent || !person) {
    return registrationError("Elegí una persona del plantel de tu academia.");
  }

  const result = await registerSeminarInscription({
    academyId: academy.id,
    eventId: activeEvent.id,
    now: new Date(),
    personId: person.personId,
    personKind: person.kind,
    seminarId: String(formData.get("seminarId") ?? ""),
  });

  // Every refusal is a toast, never a field error: nothing the academy typed is
  // wrong, the seminar simply moved under it.
  if (!result.ok) {
    return registrationError(result.error);
  }

  return {
    intent: registerSeminarInscriptionIntent,
    message: seminarInscriptionSuccessMessage,
    status: "success",
  };
}

function registrationError(message: string): PortalSeminarsActionData {
  return {
    intent: registerSeminarInscriptionIntent,
    message,
    status: "error",
  };
}
