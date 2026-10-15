import { eq } from "drizzle-orm";

import { db } from "@/db";
import { seminarPrices } from "@/db/schema";
import { requireIndividualUser } from "@/lib/auth/internal-access.server";
import { resolveInscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";
import { selectCurrentSeminarPriceRow } from "@/lib/finances/seminar-inscription-price";
import { isIndividualParticipating } from "@/lib/finances/seminar-participation.server";
import { listIndividualLinkedRosterRows } from "@/lib/individuals/link.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import { listLinkedRowsAcademySeminarInscriptions } from "@/lib/seminars/linked-individual-inscriptions.server";
import {
  readSeminarInscriptionFinanceRows,
  type SeminarInscriptionFinanceDetailRow,
} from "@/lib/finances/seminar-inscriptions.server";
import { hasCompleteSeminarPriceCells } from "@/lib/seminar-prices/participant-cells";
import {
  deleteSeminarInscriptionForAcademy,
  registerSeminarInscription,
  seminarInscriptionDeletedMessage,
  seminarInscriptionNotFoundMessage,
  seminarInscriptionSuccessMessage,
  seminarInscriptionWithdrawnMessage,
} from "@/lib/seminars/inscriptions.server";
import { listSeminarInscriptionsForAcademy } from "@/lib/seminars/inscription-rosters.server";
import { hasSeminarStarted } from "@/lib/seminars/registration-window";
import type { SeminarPriceRow } from "@/lib/seminar-prices/repository.server";
import {
  listSeminars,
  type SeminarListItem,
} from "@/lib/seminars/repository.server";
import { doesSeminarStartBeforePaymentDeadline } from "@/lib/seminars/seminar-reservations";
import { readFormData } from "@/lib/shared/read-form-data";

import {
  deleteIndividualSeminarInscriptionIntent,
  registerIndividualSeminarInscriptionIntent,
  type IndividualSeminarRow,
  type IndividualSeminarsActionData,
  type IndividualSeminarsLoaderData,
} from "./shared";

/**
 * `Seminarios` (ADR-0019): the individual registers itself through the same
 * service an academy registers its roster through, as the person its owner row
 * owns. Quota, reservation, deposit, the start-of-seminar cut-off and the
 * removal chooser are the academies' own.
 */
export async function loadIndividualSeminars(
  request: Request,
): Promise<IndividualSeminarsLoaderData> {
  const [{ individual }, { activeEvent }] = await Promise.all([
    requireIndividualUser(request),
    getPortalActiveEventSummaryContext(request),
  ]);
  // The academy reads the individual's inscriptions only through an active
  // row (`readLinkedIndividualSeminarInscriptions`), so a link that reaches
  // archived rows alone tells the individual nothing.
  const isSeenByAcademy = (
    await listIndividualLinkedRosterRows(individual)
  ).some((row) => row.status === "active");

  if (!activeEvent) {
    return {
      hasActiveEvent: false,
      hasRegistrationPrices: false,
      isSeenByAcademy,
      seminars: [],
    };
  }

  const now = new Date();
  const [eventSeminars, priceRows, inscriptions, academyMade, forParticipants] =
    await Promise.all([
      listSeminars(activeEvent.id),
      db.query.seminarPrices.findMany({
        where: eq(seminarPrices.eventId, activeEvent.id),
      }),
      listSeminarInscriptionsForAcademy({
        academyId: individual.ownerId,
        eventId: activeEvent.id,
      }),
      listLinkedRowsAcademySeminarInscriptions({
        eventId: activeEvent.id,
        individualId: individual.id,
      }),
      isIndividualParticipating(db, {
        eventId: activeEvent.id,
        individualId: individual.id,
      }),
    ]);
  const inscriptionsBySeminarId = new Map(
    inscriptions.map((inscription) => [inscription.seminarId, inscription]),
  );
  const financeRowsById = await readFinanceRows({
    eventId: activeEvent.id,
    now,
    ownerId: individual.ownerId,
    seminarIds: [...inscriptionsBySeminarId.keys()],
  });

  return {
    hasActiveEvent: true,
    hasRegistrationPrices: hasCompleteSeminarPriceCells(priceRows),
    isSeenByAcademy,
    seminars: eventSeminars.map((seminar) => {
      const inscription = inscriptionsBySeminarId.get(seminar.id);

      return {
        ...toSeminarFacts(seminar, now),
        ...(inscription
          ? toInscribedFacts(inscription, financeRowsById.get(inscription.id))
          : {
              inscription: null,
              priceAmount: readTodayPriceAmount(seminar, {
                forParticipants,
                priceRows,
              }),
            }),
        academyInscriptions: academyMade
          .filter((made) => made.seminarId === seminar.id)
          .map(({ academyName, id }) => ({ academyName, id })),
      };
    }),
  };
}

type SeminarFacts = Omit<
  IndividualSeminarRow,
  "academyInscriptions" | "inscription" | "priceAmount"
>;

function toSeminarFacts(seminar: SeminarListItem, now: Date): SeminarFacts {
  return {
    id: seminar.id,
    instructorName: seminar.instructorName,
    scheduledDate: seminar.scheduledDate,
    startTime: seminar.startTime,
    hasStarted: hasSeminarStarted(seminar, now),
    isFull: seminar.availablePlaces === 0,
    startsBeforePaymentDeadline: doesSeminarStartBeforePaymentDeadline(
      seminar,
      now,
    ),
  };
}

/** The price that applies today in the individual's participant cell
 * (`isIndividualParticipating`): the ordinary one without a confirmed link. */
function readTodayPriceAmount(
  seminar: SeminarListItem,
  input: { forParticipants: boolean; priceRows: SeminarPriceRow[] },
): number | null {
  return (
    selectCurrentSeminarPriceRow({
      forParticipants: input.forParticipants,
      priceRows: input.priceRows,
      seminarKind: seminar.kind,
    })?.amount ?? null
  );
}

/** A held inscription is priced by its own effective row, which freezes once
 * the deposit is covered, and badged as the finance lists badge it. */
function toInscribedFacts(
  inscription: { hasMoney: boolean; id: string },
  financeRow: SeminarInscriptionFinanceDetailRow | undefined,
): Pick<IndividualSeminarRow, "inscription" | "priceAmount"> {
  return {
    priceAmount: financeRow?.effectivePrice?.amount ?? null,
    inscription: {
      id: inscription.id,
      hasMoney: inscription.hasMoney,
      status: resolveInscriptionStatusBadge({
        anomalies: financeRow?.anomalies ?? [],
        financialStatus: financeRow?.financialStatus ?? "depositPending",
        reserved: financeRow?.reserved,
      }),
    },
  };
}

/** The figures of the individual's own inscriptions, through the one seminar
 * finance read every money surface shares, so `Seminarios` and the finances
 * cannot quote two prices for one inscription. */
async function readFinanceRows(input: {
  eventId: string;
  now: Date;
  ownerId: string;
  seminarIds: string[];
}): Promise<Map<string, SeminarInscriptionFinanceDetailRow>> {
  const rows = await Promise.all(
    input.seminarIds.map((seminarId) =>
      readSeminarInscriptionFinanceRows(
        { academyId: input.ownerId, eventId: input.eventId, seminarId },
        input.now,
      ),
    ),
  );

  return new Map(rows.flat().map((row) => [row.inscriptionId, row]));
}

export async function handleIndividualSeminarsAction(
  request: Request,
): Promise<IndividualSeminarsActionData> {
  const { individual } = await requireIndividualUser(request);
  const formData = await readFormData(request);
  const intent = formData.get("intent");

  if (
    intent !== registerIndividualSeminarInscriptionIntent &&
    intent !== deleteIndividualSeminarInscriptionIntent
  ) {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const { activeEvent } = await getPortalActiveEventSummaryContext(request);

  if (intent === deleteIndividualSeminarInscriptionIntent) {
    return await removeInscription(formData, {
      eventId: activeEvent?.id ?? null,
      ownerId: individual.ownerId,
    });
  }

  if (!activeEvent) {
    return actionResult(
      registerIndividualSeminarInscriptionIntent,
      "error",
      "No encontramos ese seminario.",
    );
  }

  const result = await registerSeminarInscription({
    academyId: individual.ownerId,
    eventId: activeEvent.id,
    now: new Date(),
    personId: individual.id,
    personKind: "individual",
    seminarId: String(formData.get("seminarId") ?? "").trim(),
  });

  return result.ok
    ? actionResult(
        registerIndividualSeminarInscriptionIntent,
        "success",
        seminarInscriptionSuccessMessage,
      )
    : actionResult(
        registerIndividualSeminarInscriptionIntent,
        "error",
        result.error,
      );
}

async function removeInscription(
  formData: FormData,
  context: { eventId: string | null; ownerId: string },
): Promise<IndividualSeminarsActionData> {
  const inscriptionId = String(formData.get("id") ?? "").trim();
  const failed = (message: string) =>
    actionResult(deleteIndividualSeminarInscriptionIntent, "error", message);

  if (String(formData.get("confirmDeletion") ?? "").trim() !== inscriptionId) {
    return failed("Confirmá la baja de la inscripción.");
  }

  if (!context.eventId) {
    return failed(seminarInscriptionNotFoundMessage);
  }

  const result = await deleteSeminarInscriptionForAcademy({
    academyId: context.ownerId,
    eventId: context.eventId,
    inscriptionId,
    now: new Date(),
  });

  if (!result.ok) {
    return failed(result.error);
  }

  return actionResult(
    deleteIndividualSeminarInscriptionIntent,
    "success",
    result.withdrawn
      ? seminarInscriptionWithdrawnMessage
      : seminarInscriptionDeletedMessage,
  );
}

function actionResult(
  intent: NonNullable<IndividualSeminarsActionData>["intent"],
  status: NonNullable<IndividualSeminarsActionData>["status"],
  message: string,
): IndividualSeminarsActionData {
  return { intent, message, status };
}
