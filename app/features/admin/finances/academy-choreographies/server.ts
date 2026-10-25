import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import { choreographies, events, scheduleCapacities } from "@/db/schema";
import {
  readFinanceAcademy,
  readFinanceAcademyId,
} from "@/features/admin/finances/academy.server";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { choreographyAnchor } from "@/lib/comprobantes/anchor";
import { deriveUnitBillingStatus } from "@/lib/comprobantes/anchor-billing";
import {
  deriveAcademyAnchorBilling,
  readAcademyAnchorDocuments,
} from "@/lib/comprobantes/anchor-billing.server";
import type { ComprobanteEmissionDeps } from "@/lib/comprobantes/emit-comprobante.server";
import { getComprobanteEmissionDeps } from "@/lib/comprobantes/emission-config.server";
import type { BulkEmission } from "@/features/admin/finances/comprobante-emission/bulk";
import { readChoreographyBulkEmission } from "@/features/admin/finances/comprobante-emission/bulk.server";
import {
  handleAbandonReservation,
  handleBulkEmitComprobante,
  handleRecheckComprobante,
} from "@/features/admin/finances/comprobante-emission/handlers.server";
import {
  abandonReservationIntent,
  emitComprobanteIntent,
  recheckComprobanteIntent,
} from "@/features/admin/finances/comprobante-emission/shared";
import {
  bulkChoreographyIdField,
  type BulkEmissionActionData,
} from "@/features/admin/finances/comprobante-emission/bulk";
import { calculateDepositAmount } from "@/lib/finances/inscription-financial-status";
import { loadEventPriceRows } from "@/lib/prices/rows.server";
import { resolveChoreographyPricingScheduleId } from "@/lib/finances/choreography-pricing-schedule";
import { emptyOperationalFinanceSummary } from "@/lib/finances/operational-summary";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import { withLinkedInscriptionsCounted } from "@/lib/finances/seminar-operational-summary.server";
import { readLinkedIndividualSeminarInscriptions } from "@/lib/seminars/linked-individual-inscriptions.server";
import type { ResolvedInscription } from "@/lib/finances/operational-summary-calculations.server";
import { payChoreographiesPreset } from "@/lib/finances/choreography-cobro-presets.server";
import {
  paySeminarsPreset,
  readSeminarCobroPreviews,
  type SeminarCobroPreview,
} from "@/lib/finances/seminar-cobro-presets.server";
import {
  readOwnerMovements,
  type OwnerMovementRow,
} from "@/features/admin/finances/owner-movements/server";
import { handleRegisterRefund } from "@/features/admin/finances/refunds/server";
import {
  registerRefundIntent,
  type RefundActionData,
} from "@/features/admin/finances/refunds/shared";
import { requireAdminPanelWriter } from "@/lib/auth/internal-access.server";
import { readFormData } from "@/lib/shared/read-form-data";
import type { PresetInscription } from "./preset-figures";
import {
  choreographyIdFieldName,
  financePresetAction,
  financePresetLabels,
  seminarIdFieldName,
  type PresetPriceOption,
} from "./presets";

export type AcademyFinancesActionData = {
  status: "error" | "success";
  message: string;
};

export async function loadAcademyFinances(input: {
  params: { academyId?: string };
  request: Request;
}) {
  await requireAdminPanelWriter(input.request);
  const eventContext = await loadEventContext(input.request);
  const academy = await readFinanceAcademy(readFinanceAcademyId(input.params));

  const [
    financeDetail,
    linkedInscriptions,
    priceOptionsByGroupType,
    pricingScheduleIdByChoreography,
    seminarPresetPreviews,
    movements,
  ] =
    eventContext.selectedEventId === null
      ? [
          {
            choreographyFinanceRows: [],
            inscriptions: [],
            seminarFinanceRows: [],
            seminarInscriptions: [],
            summary: emptyOperationalFinanceSummary(),
          },
          [],
          {} as Record<string, PresetPriceOption[]>,
          {} as Record<string, string | null>,
          {} as Record<string, SeminarCobroPreview>,
          [] as OwnerMovementRow[],
        ]
      : await Promise.all([
          readAcademyEventOperationalFinanceDetail({
            academyId: academy.id,
            eventId: eventContext.selectedEventId,
          }),
          readLinkedIndividualSeminarInscriptions({
            academyId: academy.id,
            eventId: eventContext.selectedEventId,
          }),
          readPresetPriceOptions(eventContext.selectedEventId),
          readPricingScheduleIdByChoreography({
            academyId: academy.id,
            eventId: eventContext.selectedEventId,
          }),
          readSeminarCobroPreviews({
            academyId: academy.id,
            eventId: eventContext.selectedEventId,
          }),
          readOwnerMovements({
            academyId: academy.id,
            eventId: eventContext.selectedEventId,
          }),
        ]);

  // Each unit's comprobante status, the second badge of its `Estado`, and
  // what a bulk emission would emit for each choreography, off one read of
  // the academy's comprobantes.
  const documents =
    eventContext.selectedEventId === null
      ? undefined
      : await readAcademyAnchorDocuments({
          academyId: academy.id,
          eventId: eventContext.selectedEventId,
        });
  const billing =
    documents &&
    deriveAcademyAnchorBilling({
      documents,
      choreographyInscriptions: financeDetail.inscriptions,
      seminarInscriptions: financeDetail.seminarInscriptions,
    });
  const bulkEmission: BulkEmission = documents
    ? await readChoreographyBulkEmission({
        rows: financeDetail.choreographyFinanceRows,
        inscriptions: financeDetail.inscriptions,
        documents: documents.choreographies,
      })
    : emptyBulkEmission();

  return {
    academy,
    bulkEmission,
    choreographyFinanceRows: financeDetail.choreographyFinanceRows.map(
      (row) => ({
        ...row,
        billingStatus: deriveUnitBillingStatus(
          billing?.choreographies.get(row.id),
        ),
      }),
    ),
    inscriptions: financeDetail.inscriptions.map(toPresetInscription),
    // The `Movimientos` tab's rows: the owner's payments and refunds.
    movements,
    priceOptionsByGroupType,
    pricingScheduleIdByChoreography,
    selectedEventId: eventContext.selectedEventId,
    // The academy's `(seminar, academy)` units, the `Seminarios` tab's rows.
    // They are a second list and not a second summary: the tabs split the
    // tables, and the figures the summary carries are one debt against one pool.
    // `Inscriptos` also counts the linked individuals' inscriptions, as the
    // academy's portal does; administration reads their money on each
    // individual's own page.
    seminarFinanceRows: withLinkedInscriptionsCounted(
      financeDetail.seminarFinanceRows.map((row) => ({
        ...row,
        billingStatus: deriveUnitBillingStatus(billing?.seminars.get(row.id)),
      })),
      linkedInscriptions,
    ),
    // What either seminar preset would charge, per seminar: the dialog reads the
    // selection's seminars out of it, from the plan the write itself runs.
    seminarPresetPreviews,
    summary: financeDetail.summary,
  };
}

/**
 * The two presets. Both are list actions fired from a dialog over the list, so
 * neither redirects: the view they were fired from still exists and still makes
 * sense, the loader revalidates the figures they moved, and the outcome travels
 * back in `fetcher.data` as a toast.
 */
export async function handleAcademyFinancesAction(input: {
  params: { academyId?: string };
  request: Request;
  // Injectable emission inputs: the tests pass a mocked ARCA client.
  resolveEmissionDeps?: () => ComprobanteEmissionDeps;
}): Promise<
  AcademyFinancesActionData | BulkEmissionActionData | RefundActionData | never
> {
  await requireAdminPanelWriter(input.request);
  const academyId = readFinanceAcademyId(input.params);
  const formData = await readFormData(input.request);
  const intent = String(formData.get("intent") ?? "");

  // The `Movimientos` tab's one write, with its own event and access checks.
  if (intent === registerRefundIntent) {
    return await handleRegisterRefund({
      academyId,
      formData,
      request: input.request,
    });
  }

  const eventContext = await loadEventContext(input.request);

  if (eventContext.selectedEventId === null) {
    return {
      status: "error",
      message: "Activá un evento para operar las coreografías.",
    };
  }

  if (emissionIntents.has(intent)) {
    return await runBulkEmissionIntent({
      academyId,
      eventId: eventContext.selectedEventId,
      formData,
      intent,
      resolveEmissionDeps:
        input.resolveEmissionDeps ?? getComprobanteEmissionDeps,
    });
  }

  const preset = financePresetAction(intent);

  if (preset === null) {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const { stage, target } = preset;
  // The seminar presets carry the selected seminars and nothing else: who is
  // charged, at which price and how much is the server's to recompute.
  const result =
    target === "seminars"
      ? await paySeminarsPreset({
          academyId,
          eventId: eventContext.selectedEventId,
          seminarIds: readIds(formData, seminarIdFieldName),
          stage,
        })
      : await payChoreographiesPreset({
          academyId,
          choreographyIds: readIds(formData, choreographyIdFieldName),
          eventId: eventContext.selectedEventId,
          priceIdByGroupType: readPriceSelection(formData),
          stage,
        });

  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  return {
    status: "success",
    message: `${financePresetLabels[stage]}: asignamos lo que adeudaban ${target === "seminars" ? "los seminarios elegidos" : "las coreografías elegidas"}.`,
  };
}

const emissionIntents = new Set([
  emitComprobanteIntent,
  recheckComprobanteIntent,
  abandonReservationIntent,
]);

/**
 * One request of a bulk emission (#617), and the two ways out of the attempt
 * that halted it: the detail's own intents, posted from the list for the
 * choreography the run is on. The choreography must be this academy's; the
 * emitter checks the event.
 */
async function runBulkEmissionIntent(input: {
  academyId: string;
  eventId: string;
  formData: FormData;
  intent: string;
  resolveEmissionDeps: () => ComprobanteEmissionDeps;
}): Promise<BulkEmissionActionData> {
  const choreographyId = String(
    input.formData.get(bulkChoreographyIdField) ?? "",
  ).trim();
  const [choreography] = choreographyId
    ? await db
        .select({ academyId: choreographies.academyId })
        .from(choreographies)
        .where(eq(choreographies.id, choreographyId))
    : [];

  if (choreography?.academyId !== input.academyId) {
    return { status: "error", message: choreographyNotFoundMessage };
  }

  const context = {
    anchor: choreographyAnchor(choreographyId),
    eventId: input.eventId,
    formData: input.formData,
    resolveEmissionDeps: input.resolveEmissionDeps,
  };

  if (input.intent === emitComprobanteIntent) {
    return await handleBulkEmitComprobante(context);
  }

  // Neither redirects: re-checking and abandoning answer in place, and the
  // detail URL they take is only used on the emission's happy path.
  const detailed = { ...context, detailUrl: "" };

  return input.intent === recheckComprobanteIntent
    ? await handleRecheckComprobante(detailed)
    : await handleAbandonReservation(detailed);
}

function emptyBulkEmission(): BulkEmission {
  return {
    plans: {},
    cbteFch: { today: "", floors: {} },
    blocked: null,
  };
}

function readIds(formData: FormData, fieldName: string): string[] {
  return formData
    .getAll(fieldName)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

/**
 * The picked price per group type. Absent entries are left out rather than
 * defaulted here: the writer treats a missing pick as *keep whatever price
 * already resolves*, which is what an inscription that already holds money
 * needs anyway.
 */
function readPriceSelection(formData: FormData): Record<string, string> {
  const selection: Record<string, string> = {};

  for (const [field, value] of formData.entries()) {
    if (!field.startsWith("price-")) {
      continue;
    }

    const priceId = String(value).trim();

    if (priceId) {
      selection[field.slice("price-".length)] = priceId;
    }
  }

  return selection;
}

/**
 * The dialog's slice of an inscription: the figures the reader already derived,
 * and what it takes to re-derive them against another price. It is trimmed here
 * rather than shipped whole because the dialog projects money and nothing else —
 * who the dancer is, and how the row is badged, are the list's business.
 */
function toPresetInscription(
  inscription: ResolvedInscription,
): PresetInscription {
  return {
    allocatedAmount: inscription.allocatedAmount,
    basePriceAmount: inscription.basePriceAmount,
    basePriceId: inscription.basePriceId,
    choreographyId: inscription.choreographyId,
    dancerDiscountAmount: inscription.dancerDiscountAmount,
    depositAmount: inscription.depositAmount,
    financialStatus: inscription.financialStatus,
    id: inscription.id,
    owedBalanceAmount: inscription.owedBalanceAmount,
    owedDepositAmount: inscription.owedDepositAmount,
    withdrawn: inscription.withdrawn,
  };
}

/**
 * Every price row of the event, bucketed by group type and carrying its
 * schedule. The group type is the only bucket the loader can build, because
 * which schedules matter depends on what the administrator selects; the picker
 * narrows the bucket to the rows the writer would accept for that selection
 * (`selectPresetPriceOptions`).
 *
 * The `Seña` of each row is computed here, off the event's percentage, so the
 * dialog can say what a pick would leave owing without carrying a rule of its
 * own.
 */
async function readPresetPriceOptions(
  eventId: string,
): Promise<Record<string, PresetPriceOption[]>> {
  const [event, rows] = await Promise.all([
    db.query.events.findFirst({
      columns: { requiredDepositPercentage: true },
      where: eq(events.id, eventId),
    }),
    loadEventPriceRows(db, eventId),
  ]);

  if (!event) {
    throw new Response("No encontramos ese evento.", { status: 404 });
  }

  const optionsByGroupType: Record<string, PresetPriceOption[]> = {};

  for (const row of [...rows].sort(
    (left, right) => left.amount - right.amount,
  )) {
    const bucket = (optionsByGroupType[row.groupType] ??= []);

    bucket.push({
      amount: row.amount,
      depositAmount: calculateDepositAmount({
        priceAmount: row.amount,
        requiredDepositPercentage: event.requiredDepositPercentage,
      }),
      id: row.id,
      name: row.name,
      paymentDeadline: row.paymentDeadline,
      scheduleIds: row.scheduleIds,
    });
  }

  return optionsByGroupType;
}

/**
 * The schedule each choreography prices against, resolved with the same rule
 * the writer uses. The picker needs it to drop the price rows bound to another
 * schedule, which the writer would refuse.
 */
async function readPricingScheduleIdByChoreography(input: {
  academyId: string;
  eventId: string;
}): Promise<Record<string, string | null>> {
  const rows = await db
    .select({
      choreographyScheduleId: choreographies.scheduleId,
      id: choreographies.id,
      scheduleCapacityScheduleId: scheduleCapacities.scheduleId,
    })
    .from(choreographies)
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .where(
      and(
        eq(choreographies.academyId, input.academyId),
        eq(choreographies.eventId, input.eventId),
      ),
    );

  const scheduleIdByChoreography: Record<string, string> = {};

  for (const row of rows) {
    scheduleIdByChoreography[row.id] =
      resolveChoreographyPricingScheduleId(row);
  }

  return scheduleIdByChoreography;
}
