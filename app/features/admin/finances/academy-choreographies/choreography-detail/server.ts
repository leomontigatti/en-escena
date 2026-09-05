import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import {
  getFacturaCEmissionDeps,
  resolveChoreographyBillable,
  type FacturaCEmissionDeps,
} from "@/lib/comprobantes/emit-factura-c.server";
import { readChoreographyInscriptionRows } from "@/lib/finances/choreography-inscriptions.server";
import {
  allocateToInscription,
  readInscriptionEffectivePrices,
  readInscriptionPriceOptions,
  releaseInscriptionExcess,
  removeFromInscription,
} from "@/lib/finances/inscription-allocation.server";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";

import {
  handleEmitComprobante,
  handleRecheckComprobante,
} from "./comprobante-emission.server";
import {
  allocateInscriptionIntent,
  choreographyDetailUrl,
  emitComprobanteIntent,
  recheckComprobanteIntent,
  releaseInscriptionExcessIntent,
  removeInscriptionMoneyIntent,
  type ChoreographyFinanceActionData,
} from "./shared";

export async function loadChoreographyFinanceDetail(input: {
  params: { academyId?: string; choreographyId?: string };
  request: Request;
}) {
  await requireInternalUser(input.request, ["admin", "auditor"]);

  const academyId = readAcademyId(input.params);
  const choreographyId = readChoreographyId(input.params);
  const [academy, eventContext] = await Promise.all([
    readAcademy(academyId),
    loadEventContext(input.request),
  ]);

  if (eventContext.selectedEventId === null) {
    return {
      academy,
      availableBalanceAmount: 0,
      choreography: null,
      inscriptions: [],
      priceOptions: [],
      selectedEventId: null,
    };
  }

  const eventId = eventContext.selectedEventId;
  const financeDetail = await readAcademyEventOperationalFinanceDetail({
    academyId,
    eventId,
  });
  const choreographyFinanceRow = financeDetail.choreographyFinanceRows.find(
    (row) => row.id === choreographyId,
  );

  if (!choreographyFinanceRow) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const [inscriptionRows, effectivePrices, priceOptions, invoicing] =
    await Promise.all([
      readChoreographyInscriptionRows({
        academyEventInscriptions: financeDetail.inscriptions,
        choreographyId,
      }),
      readInscriptionEffectivePrices({ choreographyId, eventId }),
      readInscriptionPriceOptions({ choreographyId, eventId }),
      readChoreographyInvoicing(choreographyId),
    ]);
  // One price travels with the row: the **effective** one, what the inscription
  // is charged at. It is the figure the dialog reads out, the row the picker
  // opens on and the same one `basePriceAmount` carries, so nothing on this
  // screen can name a price another part of it contradicts. The stored row is a
  // write-path concern —the `crossed` test reads it from the database— and no
  // longer travels to the client.
  const inscriptions = inscriptionRows.map((inscription) => ({
    ...inscription,
    effectivePrice:
      inscription.inscriptionId === null
        ? null
        : (effectivePrices.get(inscription.inscriptionId) ?? null),
  }));

  return {
    academy,
    // The academy's and not the choreography's: money collected but not
    // allocated belongs to neither. It travels this far because it is the pool
    // every allocation made in this detail comes out of.
    availableBalanceAmount: financeDetail.summary.availableBalanceAmount,
    invoicing,
    choreography: {
      allocatedAmount: choreographyFinanceRow.allocatedAmount,
      anomalies: choreographyFinanceRow.anomalies,
      choreographyNumber: choreographyFinanceRow.choreographyNumber,
      depositAmount: choreographyFinanceRow.depositAmount,
      financialStatus: choreographyFinanceRow.financialStatus,
      groupType: choreographyFinanceRow.groupType,
      id: choreographyFinanceRow.id,
      name: choreographyFinanceRow.name,
      overAllocatedAmount: choreographyFinanceRow.overAllocatedAmount,
      owedBalanceAmount: choreographyFinanceRow.owedBalanceAmount,
      owedDepositAmount: choreographyFinanceRow.owedDepositAmount,
      totalAmount: choreographyFinanceRow.totalAmount,
    },
    inscriptions,
    priceOptions,
    selectedEventId: eventId,
  };
}

export type ChoreographyInvoicing = {
  // The collected remainder not yet covered by a comprobante in force. Emission
  // bills exactly this (#446); the UX previews it.
  billableAmount: number;
  // There is something to bill: the emission affordance is only enabled with a
  // remainder.
  canEmit: boolean;
};

/**
 * The detail's emission axis: what is left to bill. Mirrors the server's own
 * emission precondition (`emitChoreographyFacturaC`), which is now the single
 * test `total > 0` — with `porcion` gone there is no second derivable input the
 * button could disagree with.
 */
async function readChoreographyInvoicing(
  choreographyId: string,
): Promise<ChoreographyInvoicing> {
  const billable = await resolveChoreographyBillable(choreographyId);

  return {
    billableAmount: billable.total,
    canEmit: billable.total > 0,
  };
}

export async function handleChoreographyFinanceAction(input: {
  params: { academyId?: string; choreographyId?: string };
  request: Request;
  // Injectable emission inputs: the tests pass a mocked ARCA client; in
  // production they are resolved from the environment (cert+key, sales point).
  resolveEmissionDeps?: () => FacturaCEmissionDeps;
}): Promise<ChoreographyFinanceActionData | never> {
  await requireAdminUser(input.request);

  const academyId = readAcademyId(input.params);
  const choreographyId = readChoreographyId(input.params);
  const eventContext = await loadEventContext(input.request);

  if (eventContext.selectedEventId === null) {
    return {
      status: "error",
      message: "Activá un evento para operar la coreografía.",
    };
  }

  const eventId = eventContext.selectedEventId;
  const formData = await input.request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (
    intent === allocateInscriptionIntent ||
    intent === removeInscriptionMoneyIntent ||
    intent === releaseInscriptionExcessIntent
  ) {
    const result = await runInscriptionMoneyIntent({
      academyId,
      choreographyId,
      eventId,
      formData,
      intent,
    });

    if (result !== null) {
      return result;
    }

    throw redirectToDetail(academyId, choreographyId, eventId);
  }

  if (intent === emitComprobanteIntent) {
    return await handleEmitComprobante({
      academyId,
      choreographyId,
      confirm: String(formData.get("confirm") ?? ""),
      eventId,
      resolveEmissionDeps: input.resolveEmissionDeps ?? getFacturaCEmissionDeps,
    });
  }

  if (intent === recheckComprobanteIntent) {
    return await handleRecheckComprobante({
      academyId,
      choreographyId,
      cbteNro: String(formData.get("cbteNro") ?? ""),
      eventId,
      resolveEmissionDeps: input.resolveEmissionDeps ?? getFacturaCEmissionDeps,
    });
  }

  return { status: "error", message: "No pudimos procesar esa acción." };
}

/**
 * The three money gestures of an inscription, which differ only in what they
 * read off the form: an amount for two of them and nothing at all for the
 * release, whose figure is computed. Returns `null` when the write succeeded,
 * so the caller redirects; an error otherwise, which keeps the dialog open with
 * what the administrator typed.
 */
async function runInscriptionMoneyIntent(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  formData: FormData;
  intent: string;
}): Promise<ChoreographyFinanceActionData | null> {
  const inscriptionId = String(
    input.formData.get("inscriptionId") ?? "",
  ).trim();

  if (!inscriptionId) {
    return { status: "error", message: "No encontramos esa inscripción." };
  }

  const target = {
    academyId: input.academyId,
    choreographyId: input.choreographyId,
    eventId: input.eventId,
    inscriptionId,
  };

  if (input.intent === releaseInscriptionExcessIntent) {
    const result = await releaseInscriptionExcess(target);

    return result.ok ? null : { status: "error", message: result.message };
  }

  const amount = readAmount(input.formData);

  if (amount === null) {
    return { status: "error", message: "Ingresá un monto mayor a 0." };
  }

  const result =
    input.intent === allocateInscriptionIntent
      ? await allocateToInscription({
          ...target,
          amount,
          priceId: readPriceId(input.formData),
        })
      : await removeFromInscription({ ...target, amount });

  return result.ok ? null : { status: "error", message: result.message };
}

/** The typed amount, or `null` when it is not a positive whole number. */
function readAmount(formData: FormData): number | null {
  const amount = Number(String(formData.get("amount") ?? "").trim());

  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

/**
 * The price chosen inside the dialog. `null` when the field is absent, which is
 * how a locked price arrives: the dialog shows it as a readout and submits
 * nothing, so the inscription keeps the row it already holds.
 */
function readPriceId(formData: FormData): string | null {
  const priceId = String(formData.get("priceId") ?? "").trim();

  return priceId === "" ? null : priceId;
}

function redirectToDetail(
  academyId: string,
  choreographyId: string,
  eventId: string,
) {
  return redirect(choreographyDetailUrl(academyId, choreographyId, eventId));
}

async function readAcademy(academyId: string) {
  const academy = await db.query.academies.findFirst({
    columns: {
      contactName: true,
      id: true,
      name: true,
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

function readChoreographyId(params: { choreographyId?: string }) {
  if (!params.choreographyId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  return params.choreographyId;
}
