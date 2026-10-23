import { eq } from "drizzle-orm";

import { db } from "@/db";
import { seminarPrices } from "@/db/schema";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { selectCurrentSeminarPriceRow } from "@/lib/finances/seminar-inscription-price";
import { readEventParticipation } from "@/lib/participation/participation.server";
import { getPortalActiveEventContext } from "@/lib/portal/event-context.server";
import { hasCompleteSeminarPriceCells } from "@/lib/seminar-prices/participant-cells";
import type { SeminarPriceRow } from "@/lib/seminar-prices/repository.server";
import {
  deleteSeminarInscriptionForAcademy,
  registerSeminarInscription,
  seminarInscriptionDeletedMessage,
  seminarInscriptionNotFoundMessage,
  seminarInscriptionSuccessMessage,
  seminarInscriptionWithdrawnMessage,
} from "@/lib/seminars/inscriptions.server";
import {
  listSeminarInscriptionsForAcademy,
  listSeminarPersonOptionsForAcademy,
} from "@/lib/seminars/inscription-rosters.server";
import { readLinkedIndividualSeminarInscriptions } from "@/lib/seminars/linked-individual-inscriptions.server";
import { hasSeminarStarted } from "@/lib/seminars/registration-window";
import {
  getSeminar,
  type SeminarListItem,
} from "@/lib/seminars/repository.server";
import { doesSeminarStartBeforePaymentDeadline } from "@/lib/seminars/seminar-reservations";
import {
  resolveInscriptionStatusBadge,
  type InscriptionStatusBadge,
} from "@/lib/finances/inscription-financial-status";
import {
  readSeminarInscriptionFinanceRows,
  type SeminarInscriptionFinanceDetailRow,
} from "@/lib/finances/seminar-inscriptions.server";
import { readFormData } from "@/lib/shared/read-form-data";

import {
  deletePortalSeminarInscriptionIntent,
  parsePortalSeminarPersonValue,
  registerPortalSeminarInscriptionIntent,
  type PortalSeminarPersonOption,
} from "../shared";
import type {
  PortalSeminarDetailActionData,
  PortalSeminarDetailLoaderData,
  PortalSeminarDetailPersonOption,
} from "./shared";

const seminarNotFoundMessage = "No encontramos ese seminario.";

/**
 * The academy's own view of one seminar: who it registered, and the two notices
 * that can hang over the page. A seminar of another event — or of no event the
 * academy can see — is indistinguishable from one that does not exist, so both
 * are a 404.
 */
export async function loadPortalSeminarDetail(input: {
  params: { seminarId?: string };
  request: Request;
}): Promise<PortalSeminarDetailLoaderData> {
  const { academy } = await requireAcademyUser(input.request);
  const { activeEvent } = await getPortalActiveEventContext(input.request);
  const seminarId = String(input.params.seminarId ?? "").trim();

  if (!activeEvent || !seminarId) {
    throw new Response(seminarNotFoundMessage, { status: 404 });
  }

  const seminar = await getSeminar(seminarId);

  if (!seminar || seminar.eventId !== activeEvent.id) {
    throw new Response(seminarNotFoundMessage, { status: 404 });
  }

  // The price list is an event-level fact, so it is read of the event rather
  // than of the seminar: while a participant cell has no deadline-less `Común`
  // row, every seminar of the event is closed to registration. The same rows
  // price each person the dialog offers.
  const now = new Date();
  const [
    inscriptions,
    people,
    priceRows,
    financeRows,
    linkedIndividualInscriptions,
  ] = await Promise.all([
    listSeminarInscriptionsForAcademy({
      academyId: academy.id,
      eventId: activeEvent.id,
    }),
    listSeminarPersonOptionsForAcademy(academy.id),
    db.query.seminarPrices.findMany({
      where: eq(seminarPrices.eventId, activeEvent.id),
    }),
    readSeminarInscriptionFinanceRows(
      { academyId: academy.id, eventId: activeEvent.id, seminarId },
      now,
    ),
    readLinkedIndividualSeminarInscriptions({
      academyId: academy.id,
      eventId: activeEvent.id,
      seminarId,
    }),
  ]);
  const financeRowsById = new Map(
    financeRows.map((row) => [row.inscriptionId, row]),
  );
  const seminarInscriptions = inscriptions.filter(
    (inscription) => inscription.seminarId === seminar.id,
  );
  const registeredPersonIds = new Set(
    seminarInscriptions.map((inscription) => inscription.personId),
  );
  // A person the academy already has actively registered is off the picker;
  // one whose row was withdrawn is offered, and registering them inserts a
  // new row beside the withdrawn one.
  const pickablePeople = await withTodayPriceAmounts(
    people.filter((person) => !registeredPersonIds.has(person.id)),
    { eventId: activeEvent.id, priceRows, seminar },
  );

  return {
    seminar: {
      id: seminar.id,
      instructorName: seminar.instructorName,
      scheduledDate: seminar.scheduledDate,
      startTime: seminar.startTime,
      hasStarted: hasSeminarStarted(seminar, now),
      hasRegistrationPrices: hasCompleteSeminarPriceCells(priceRows),
      isFull: seminar.availablePlaces === 0,
      requiredDepositPercentage: seminar.requiredDepositPercentage,
      startsBeforePaymentDeadline: doesSeminarStartBeforePaymentDeadline(
        seminar,
        now,
      ),
    },
    inscriptions: [
      ...seminarInscriptions.map((inscription) => ({
        id: inscription.id,
        fullName: inscription.fullName,
        personKind: inscription.personKind,
        hasMoney: inscription.hasMoney,
        readOnly: false,
        status: toStatusBadge(financeRowsById.get(inscription.id)),
      })),
      // Named as the academy's own row names the person, and holding nothing
      // of the individual's money: not even whether it has any.
      ...linkedIndividualInscriptions.map((inscription) => ({
        id: inscription.inscriptionId,
        fullName: `${inscription.firstName} ${inscription.lastName}`,
        personKind: "individual" as const,
        hasMoney: false,
        readOnly: true,
        status: null,
      })),
    ],
    people: pickablePeople,
  };
}

/**
 * What registering each person would cost today: the row of the seminar's kind
 * in their participant cell (`readSeminarParticipation`'s rule for a roster
 * row), which is the row an unpriced inscription of theirs resolves to. The
 * dialog quotes it, split, before the academy confirms (#1705).
 */
async function withTodayPriceAmounts(
  people: PortalSeminarPersonOption[],
  input: {
    eventId: string;
    priceRows: SeminarPriceRow[];
    seminar: Pick<SeminarListItem, "kind">;
  },
): Promise<PortalSeminarDetailPersonOption[]> {
  const participation = await readEventParticipation(db, {
    dancerIds: people
      .filter((person) => person.kind === "dancer")
      .map((person) => person.id),
    eventId: input.eventId,
    professorIds: people
      .filter((person) => person.kind === "professor")
      .map((person) => person.id),
  });

  return people.map((person) => ({
    ...person,
    priceAmount:
      selectCurrentSeminarPriceRow({
        forParticipants: (person.kind === "dancer"
          ? participation.dancerIds
          : participation.professorIds
        ).has(person.id),
        priceRows: input.priceRows,
        seminarKind: input.seminar.kind,
      })?.amount ?? null,
  }));
}

/**
 * The badge the finance lists give the same row, so the seminar and
 * `Resumen financiero` cannot name one inscription two ways.
 */
function toStatusBadge(
  row: SeminarInscriptionFinanceDetailRow | undefined,
): InscriptionStatusBadge {
  return resolveInscriptionStatusBadge({
    anomalies: row?.anomalies ?? [],
    financialStatus: row?.financialStatus ?? "depositPending",
    reserved: row?.reserved,
  });
}

export async function handlePortalSeminarDetailAction(input: {
  params: { seminarId?: string };
  request: Request;
}): Promise<PortalSeminarDetailActionData> {
  const { academy } = await requireAcademyUser(input.request);
  const formData = await readFormData(input.request);
  const intent = formData.get("intent");

  if (
    intent !== registerPortalSeminarInscriptionIntent &&
    intent !== deletePortalSeminarInscriptionIntent
  ) {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const { activeEvent } = await getPortalActiveEventContext(input.request);
  const context = {
    academyId: academy.id,
    eventId: activeEvent?.id ?? null,
    seminarId: String(input.params.seminarId ?? "").trim(),
  };

  if (intent === deletePortalSeminarInscriptionIntent) {
    return await removeInscription(formData, context);
  }

  return await registerInscription(formData, context);
}

type ActionContext = {
  academyId: string;
  eventId: string | null;
  seminarId: string;
};

async function registerInscription(
  formData: FormData,
  context: ActionContext,
): Promise<PortalSeminarDetailActionData> {
  const person = parsePortalSeminarPersonValue(
    String(formData.get("person") ?? ""),
  );

  if (!context.eventId || !person) {
    return actionResult(
      registerPortalSeminarInscriptionIntent,
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
    seminarId: context.seminarId,
  });

  // Every refusal is a toast, never a field error: nothing the academy typed is
  // wrong, the seminar simply moved under it.
  if (!result.ok) {
    return actionResult(
      registerPortalSeminarInscriptionIntent,
      "error",
      result.error,
    );
  }

  return actionResult(
    registerPortalSeminarInscriptionIntent,
    "success",
    seminarInscriptionSuccessMessage,
  );
}

async function removeInscription(
  formData: FormData,
  context: ActionContext,
): Promise<PortalSeminarDetailActionData> {
  const inscriptionId = String(formData.get("id") ?? "").trim();
  const failed = (message: string) =>
    actionResult(deletePortalSeminarInscriptionIntent, "error", message);

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
    deletePortalSeminarInscriptionIntent,
    "success",
    result.withdrawn
      ? seminarInscriptionWithdrawnMessage
      : seminarInscriptionDeletedMessage,
  );
}

function actionResult(
  intent: NonNullable<PortalSeminarDetailActionData>["intent"],
  status: NonNullable<PortalSeminarDetailActionData>["status"],
  message: string,
): PortalSeminarDetailActionData {
  return { intent, message, status };
}
