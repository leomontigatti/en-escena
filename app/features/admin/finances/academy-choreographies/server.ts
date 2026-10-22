import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, events, scheduleCapacities } from "@/db/schema";
import {
  readFinanceAcademy,
  readFinanceAcademyId,
} from "@/features/admin/finances/academy.server";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { deriveUnitBillingStatus } from "@/lib/comprobantes/anchor-billing";
import { readAcademyAnchorBilling } from "@/lib/comprobantes/anchor-billing.server";
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
        ]);

  // Each unit's comprobante status, the second badge of its `Estado`.
  const billing =
    eventContext.selectedEventId === null
      ? undefined
      : await readAcademyAnchorBilling({
          academyId: academy.id,
          eventId: eventContext.selectedEventId,
          choreographyInscriptions: financeDetail.inscriptions,
          seminarInscriptions: financeDetail.seminarInscriptions,
        });

  return {
    academy,
    choreographyFinanceRows: financeDetail.choreographyFinanceRows.map(
      (row) => ({
        ...row,
        billingStatus: deriveUnitBillingStatus(
          billing?.choreographies.get(row.id),
        ),
      }),
    ),
    inscriptions: financeDetail.inscriptions.map(toPresetInscription),
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
}): Promise<AcademyFinancesActionData | never> {
  await requireAdminPanelWriter(input.request);
  const academyId = readFinanceAcademyId(input.params);
  const eventContext = await loadEventContext(input.request);

  if (eventContext.selectedEventId === null) {
    return {
      status: "error",
      message: "Activá un evento para operar las coreografías.",
    };
  }

  const formData = await readFormData(input.request);
  const preset = financePresetAction(String(formData.get("intent") ?? ""));

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
