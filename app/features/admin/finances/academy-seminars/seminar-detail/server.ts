import { redirect } from "react-router";

import {
  allocateInscriptionIntent,
  readAllocationTargetKind,
  readMoneyAmount,
  readPickedPriceId,
  releaseInscriptionExcessIntent,
  removeInscriptionMoneyIntent,
} from "@/features/admin/finances/inscription-money/intents";
import {
  readFinanceAcademy,
  readFinanceAcademyId,
} from "@/features/admin/finances/academy.server";
import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import {
  allocateToSeminarInscription,
  readSeminarInscriptionPriceOptions,
  releaseSeminarInscriptionExcess,
  removeFromSeminarInscription,
  type SeminarInscriptionPriceOption,
} from "@/lib/finances/seminar-inscription-allocation.server";
import { readSeminarInscriptionFinanceRows } from "@/lib/finances/seminar-inscriptions.server";
import { getSeminar } from "@/lib/seminars/repository.server";

import {
  seminarFinanceDetailUrl,
  type SeminarFinanceActionData,
} from "./shared";

const seminarNotFoundMessage = "No encontramos ese seminario.";

/**
 * The `(seminar, academy)` financial detail: the twin of the choreography one,
 * read off the same academy rollup so the figures here and the row on the
 * academy's `Seminarios` tab cannot disagree.
 *
 * The seminar is titled by its **instructor alone**, which is how a seminar is
 * named everywhere on both sides; the date is what disambiguates two seminars of
 * the same instructor and it travels as the description.
 */
export async function loadSeminarFinanceDetail(input: {
  params: { academyId?: string; seminarId?: string };
  request: Request;
}) {
  await requireInternalUser(input.request, ["admin", "auditor"]);

  const academyId = readFinanceAcademyId(input.params);
  const seminarId = readSeminarId(input.params);
  const [academy, eventContext] = await Promise.all([
    readFinanceAcademy(academyId),
    loadEventContext(input.request),
  ]);

  if (eventContext.selectedEventId === null) {
    return {
      academy,
      availableBalanceAmount: 0,
      inscriptions: [],
      priceOptionsByInscription: {} as Record<
        string,
        SeminarInscriptionPriceOption[]
      >,
      seminar: null,
      selectedEventId: null,
    };
  }

  const eventId = eventContext.selectedEventId;
  const financeDetail = await readAcademyEventOperationalFinanceDetail({
    academyId,
    eventId,
  });
  const seminarFinanceRow = financeDetail.seminarFinanceRows.find(
    (row) => row.id === seminarId,
  );

  if (!seminarFinanceRow) {
    throw new Response(seminarNotFoundMessage, { status: 404 });
  }

  const [inscriptions, priceOptions, seminarRow] = await Promise.all([
    readSeminarInscriptionFinanceRows({ academyId, eventId, seminarId }),
    readSeminarInscriptionPriceOptions({ eventId, seminarId }),
    getSeminar(seminarId),
  ]);

  return {
    academy,
    // The academy's and not the seminar's: money collected but not allocated
    // belongs to neither, and it is the pool the allocations made here come out
    // of.
    availableBalanceAmount: financeDetail.summary.availableBalanceAmount,
    inscriptions,
    // A plain object rather than the `Map` the reader answers: it has to survive
    // the loader's serialization on its way to the view.
    priceOptionsByInscription: Object.fromEntries(
      inscriptions.map((inscription) => [
        inscription.inscriptionId,
        priceOptions.get(inscription.inscriptionId) ?? [],
      ]),
    ),
    seminar: {
      allocatedAmount: seminarFinanceRow.allocatedAmount,
      anomalies: seminarFinanceRow.anomalies,
      // The quota minus the **covered** inscriptions, whichever academy holds
      // them: a place is taken by covering a deposit, so this is what says
      // whether the next crossing here can go through at all.
      availablePlaces: seminarRow?.availablePlaces ?? 0,
      depositAmount: seminarFinanceRow.depositAmount,
      financialStatus: seminarFinanceRow.financialStatus,
      id: seminarFinanceRow.id,
      instructorName: seminarFinanceRow.instructorName,
      owedBalanceAmount: seminarFinanceRow.owedBalanceAmount,
      owedDepositAmount: seminarFinanceRow.owedDepositAmount,
      registrationCount: seminarFinanceRow.registrationCount,
      scheduledDate: seminarFinanceRow.scheduledDate,
      totalAmount: seminarFinanceRow.totalAmount,
    },
    selectedEventId: eventId,
  };
}

/**
 * The three money gestures of a seminar inscription. They are the choreography
 * action's twin down to the redirect: a write that went through leaves the
 * dialog by revalidating the detail, and a refusal comes back as a message the
 * dialog keeps on screen.
 */
export async function handleSeminarFinanceAction(input: {
  params: { academyId?: string; seminarId?: string };
  request: Request;
}): Promise<SeminarFinanceActionData | never> {
  await requireAdminUser(input.request);

  const academyId = readFinanceAcademyId(input.params);
  const seminarId = readSeminarId(input.params);
  const eventContext = await loadEventContext(input.request);

  if (eventContext.selectedEventId === null) {
    return {
      status: "error",
      message: "Activá un evento para operar el seminario.",
    };
  }

  const eventId = eventContext.selectedEventId;
  const formData = await input.request.formData();
  const result = await runSeminarMoneyIntent({
    academyId,
    eventId,
    formData,
    seminarId,
  });

  if (result !== null) {
    return result;
  }

  throw redirectToDetail(academyId, seminarId, eventId);
}

/**
 * The three money gestures of a seminar inscription, which differ only in what
 * they read off the form: an amount for two of them and nothing at all for the
 * release, whose figure is computed. Returns `null` when the write succeeded, so
 * the caller redirects; an error otherwise, which keeps the dialog open with
 * what the administrator typed.
 */
async function runSeminarMoneyIntent(input: {
  academyId: string;
  eventId: string;
  formData: FormData;
  seminarId: string;
}): Promise<SeminarFinanceActionData | null> {
  const target = readSeminarMoneyTarget(input);

  if ("status" in target) {
    return target;
  }

  if (target.intent === releaseInscriptionExcessIntent) {
    const released = await releaseSeminarInscriptionExcess(target.target);

    return released.ok ? null : { status: "error", message: released.message };
  }

  const amount = readMoneyAmount(input.formData);

  if (amount === null) {
    return { status: "error", message: "Ingresá un monto mayor a 0." };
  }

  const result =
    target.intent === allocateInscriptionIntent
      ? await allocateToSeminarInscription({
          ...target.target,
          amount,
          priceId: readPickedPriceId(input.formData),
        })
      : await removeFromSeminarInscription({ ...target.target, amount });

  return result.ok ? null : { status: "error", message: result.message };
}

type SeminarMoneyTarget =
  | SeminarFinanceActionData
  | {
      intent: string;
      target: {
        academyId: string;
        eventId: string;
        inscriptionId: string;
        seminarId: string;
      };
    };

/**
 * What the form named, or the refusal that says it named nothing this action
 * owns. The shared dialog carries the kind it is about, and this action owns one
 * of them: a choreography target reaching here is a form pointed at the wrong
 * writer, not an inscription that went missing.
 */
function readSeminarMoneyTarget(input: {
  academyId: string;
  eventId: string;
  formData: FormData;
  seminarId: string;
}): SeminarMoneyTarget {
  const intent = String(input.formData.get("intent") ?? "");
  const isMoneyIntent =
    intent === allocateInscriptionIntent ||
    intent === removeInscriptionMoneyIntent ||
    intent === releaseInscriptionExcessIntent;

  if (
    !isMoneyIntent ||
    readAllocationTargetKind(input.formData) !== "seminar"
  ) {
    return { status: "error", message: "No pudimos procesar esa acción." };
  }

  const inscriptionId = String(
    input.formData.get("inscriptionId") ?? "",
  ).trim();

  if (!inscriptionId) {
    return { status: "error", message: "No encontramos esa inscripción." };
  }

  return {
    intent,
    target: {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptionId,
      seminarId: input.seminarId,
    },
  };
}

function redirectToDetail(
  academyId: string,
  seminarId: string,
  eventId: string,
) {
  return redirect(seminarFinanceDetailUrl(academyId, seminarId, eventId));
}

function readSeminarId(params: { seminarId?: string }) {
  if (!params.seminarId) {
    throw new Response(seminarNotFoundMessage, { status: 404 });
  }

  return params.seminarId;
}
