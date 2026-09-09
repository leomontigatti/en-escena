import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { getPortalActiveEventContext } from "@/lib/portal/event-context.server";
import {
  deleteSeminarInscriptionForAcademy,
  listSeminarInscriptionsForAcademy,
  listSeminarPersonOptionsForAcademy,
  registerSeminarInscription,
  seminarInscriptionDeletedMessage,
  seminarInscriptionNotFoundMessage,
  seminarInscriptionSuccessMessage,
} from "@/lib/seminars/inscriptions.server";
import { hasSeminarStarted } from "@/lib/seminars/registration-window";
import { listSeminars } from "@/lib/seminars/repository.server";
import {
  createDefaultSeminarPictureStorage,
  loadSeminarInstructorPictureUrl,
} from "@/lib/storage/seminar-pictures.server";

import {
  deleteSeminarInscriptionIntent,
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
  const intent = formData.get("intent");

  if (
    intent !== registerSeminarInscriptionIntent &&
    intent !== deleteSeminarInscriptionIntent
  ) {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const { activeEvent } = await getPortalActiveEventContext(request);

  if (intent === deleteSeminarInscriptionIntent) {
    return await removeInscription(formData, {
      academyId: academy.id,
      eventId: activeEvent?.id ?? null,
    });
  }

  return await registerInscription(formData, {
    academyId: academy.id,
    eventId: activeEvent?.id ?? null,
  });
}

async function registerInscription(
  formData: FormData,
  context: { academyId: string; eventId: string | null },
): Promise<PortalSeminarsActionData> {
  const person = parseSeminarPersonValue(String(formData.get("person") ?? ""));

  if (!context.eventId || !person) {
    return actionResult(
      registerSeminarInscriptionIntent,
      "error",
      "Elegí una persona del plantel de tu academia.",
    );
  }

  const result = await registerSeminarInscription({
    academyId: context.academyId,
    eventId: context.eventId,
    now: new Date(),
    personId: person.personId,
    personKind: person.kind,
    seminarId: String(formData.get("seminarId") ?? ""),
  });

  // Every refusal is a toast, never a field error: nothing the academy typed is
  // wrong, the seminar simply moved under it.
  if (!result.ok) {
    return actionResult(
      registerSeminarInscriptionIntent,
      "error",
      result.error,
    );
  }

  return actionResult(
    registerSeminarInscriptionIntent,
    "success",
    seminarInscriptionSuccessMessage,
  );
}

async function removeInscription(
  formData: FormData,
  context: { academyId: string; eventId: string | null },
): Promise<PortalSeminarsActionData> {
  const inscriptionId = String(formData.get("id") ?? "").trim();
  const failed = (message: string) =>
    actionResult(deleteSeminarInscriptionIntent, "error", message);

  if (String(formData.get("confirmDeletion") ?? "").trim() !== inscriptionId) {
    return failed("Confirmá la baja de la inscripción.");
  }

  if (!context.eventId) {
    return failed(seminarInscriptionNotFoundMessage);
  }

  const result = await deleteSeminarInscriptionForAcademy({
    academyId: context.academyId,
    eventId: context.eventId,
    inscriptionId,
    now: new Date(),
  });

  if (!result.ok) {
    return failed(result.error);
  }

  return actionResult(
    deleteSeminarInscriptionIntent,
    "success",
    seminarInscriptionDeletedMessage,
  );
}

function actionResult(
  intent: NonNullable<PortalSeminarsActionData>["intent"],
  status: NonNullable<PortalSeminarsActionData>["status"],
  message: string,
): PortalSeminarsActionData {
  return { intent, message, status };
}
