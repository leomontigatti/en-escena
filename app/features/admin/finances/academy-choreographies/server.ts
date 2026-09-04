import { asc, and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  choreographies,
  events,
  prices,
  scheduleCapacities,
} from "@/db/schema";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { calculateDepositAmount } from "@/lib/finances/inscription-financial-status";
import { resolveChoreographyPricingScheduleId } from "@/lib/finances/choreography-pricing-schedule";
import { emptyOperationalFinanceSummary } from "@/lib/finances/operational-summary";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import type { ResolvedInscription } from "@/lib/finances/operational-summary-calculations.server";
import { payChoreographiesPreset } from "@/lib/finances/choreography-cobro-presets.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import type { PresetInscription } from "./preset-figures";
import {
  choreographyIdFieldName,
  financePresetLabels,
  financePresetStage,
  type PresetPriceOption,
} from "./presets";

export type AcademyFinancesActionData = {
  status: "error" | "success";
  message: string;
};

export type { PresetPriceOption };

export async function loadAcademyFinances(input: {
  params: { academyId?: string };
  request: Request;
}) {
  await requireInternalUser(input.request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(input.request);
  const academy = await readAcademy(readAcademyId(input.params));

  const [
    financeDetail,
    priceOptionsByGroupType,
    pricingScheduleIdByChoreography,
  ] =
    eventContext.selectedEventId === null
      ? [
          {
            choreographyFinanceRows: [],
            inscriptions: [],
            summary: emptyOperationalFinanceSummary(),
          },
          {} as Record<string, PresetPriceOption[]>,
          {} as Record<string, string | null>,
        ]
      : await Promise.all([
          readAcademyEventOperationalFinanceDetail({
            academyId: academy.id,
            eventId: eventContext.selectedEventId,
          }),
          readPresetPriceOptions(eventContext.selectedEventId),
          readPricingScheduleIdByChoreography({
            academyId: academy.id,
            eventId: eventContext.selectedEventId,
          }),
        ]);

  return {
    academy,
    choreographyFinanceRows: financeDetail.choreographyFinanceRows,
    inscriptions: financeDetail.inscriptions.map(toPresetInscription),
    priceOptionsByGroupType,
    pricingScheduleIdByChoreography,
    selectedEventId: eventContext.selectedEventId,
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
  await requireAdminUser(input.request);
  const academyId = readAcademyId(input.params);
  const eventContext = await loadEventContext(input.request);

  if (eventContext.selectedEventId === null) {
    return {
      status: "error",
      message: "Activá un evento para operar las coreografías.",
    };
  }

  const formData = await input.request.formData();
  const stage = financePresetStage(String(formData.get("intent") ?? ""));

  if (stage === null) {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const result = await payChoreographiesPreset({
    academyId,
    choreographyIds: formData
      .getAll(choreographyIdFieldName)
      .map((value) => String(value).trim())
      .filter(Boolean),
    eventId: eventContext.selectedEventId,
    priceIdByGroupType: readPriceSelection(formData),
    stage,
  });

  if (!result.ok) {
    return { status: "error", message: result.message };
  }

  return {
    status: "success",
    message: `${financePresetLabels[stage]}: asignamos lo que adeudaban las coreografías elegidas.`,
  };
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
    db
      .select({
        amount: prices.amount,
        groupType: prices.groupType,
        id: prices.id,
        name: prices.name,
        paymentDeadline: prices.paymentDeadline,
        scheduleId: prices.scheduleId,
      })
      .from(prices)
      .where(eq(prices.eventId, eventId))
      .orderBy(asc(prices.amount)),
  ]);

  if (!event) {
    throw new Response("No encontramos ese evento.", { status: 404 });
  }

  const optionsByGroupType: Record<string, PresetPriceOption[]> = {};

  for (const row of rows) {
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
      scheduleId: row.scheduleId,
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

  const scheduleIdByChoreography: Record<string, string | null> = {};

  for (const row of rows) {
    scheduleIdByChoreography[row.id] =
      resolveChoreographyPricingScheduleId(row);
  }

  return scheduleIdByChoreography;
}

async function readAcademy(academyId: string) {
  const academy = await db.query.academies.findFirst({
    columns: {
      id: true,
      name: true,
      contactName: true,
      phone: true,
    },
    where: eq(academies.id, academyId),
  });

  if (!academy) {
    throw new Response("No encontramos esa academia.", { status: 404 });
  }

  return academy;
}

function readAcademyId(params: { academyId?: string }) {
  if (!params.academyId) {
    throw new Response("No encontramos esa academia.", { status: 404 });
  }

  return params.academyId;
}
