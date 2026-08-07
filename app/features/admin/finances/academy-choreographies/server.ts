import { asc, eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies, prices } from "@/db/schema";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { emptyOperationalFinanceSummary } from "@/lib/finances/operational-summary";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import { payChoreographiesPreset } from "@/lib/finances/choreography-cobro-presets.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { choreographyIdFieldName, financePresetStage } from "./presets";

export type AcademyFinancesActionData = { status: "error"; message: string };

/**
 * The price rows a preset may fix on an inscription, grouped by group type: the
 * picker filters to the choreography's group type, because offering a foreign
 * row is offering to create a forbidden state.
 */
export type PresetPriceOption = {
  amount: number;
  id: string;
  name: string;
  paymentDeadline: string | null;
};

export async function loadAcademyFinances(input: {
  params: { academyId?: string };
  request: Request;
}) {
  await requireInternalUser(input.request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(input.request);
  const academy = await readAcademy(readAcademyId(input.params));

  const [financeDetail, priceOptionsByGroupType] =
    eventContext.selectedEventId === null
      ? [
          {
            choreographyFinanceRows: [],
            summary: emptyOperationalFinanceSummary(),
          },
          {} as Record<string, PresetPriceOption[]>,
        ]
      : await Promise.all([
          readAcademyEventOperationalFinanceDetail({
            academyId: academy.id,
            eventId: eventContext.selectedEventId,
          }),
          readPresetPriceOptions(eventContext.selectedEventId),
        ]);

  return {
    academy,
    choreographyFinanceRows: financeDetail.choreographyFinanceRows,
    priceOptionsByGroupType,
    selectedEventId: eventContext.selectedEventId,
    summary: financeDetail.summary,
  };
}

/**
 * The two presets. Both are list actions over the selected choreographies and
 * both redirect back to the list on success: the figures they moved are the
 * list's own, so the loader re-reading them is the feedback.
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

  throw redirect(
    `/administracion/finanzas/${academyId}?evento=${eventContext.selectedEventId}`,
  );
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

async function readPresetPriceOptions(
  eventId: string,
): Promise<Record<string, PresetPriceOption[]>> {
  const rows = await db
    .select({
      amount: prices.amount,
      groupType: prices.groupType,
      id: prices.id,
      name: prices.name,
      paymentDeadline: prices.paymentDeadline,
    })
    .from(prices)
    .where(eq(prices.eventId, eventId))
    .orderBy(asc(prices.amount));

  const optionsByGroupType: Record<string, PresetPriceOption[]> = {};

  for (const row of rows) {
    const bucket = (optionsByGroupType[row.groupType] ??= []);

    bucket.push({
      amount: row.amount,
      id: row.id,
      name: row.name,
      paymentDeadline: row.paymentDeadline,
    });
  }

  return optionsByGroupType;
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
