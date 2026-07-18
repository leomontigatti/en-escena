import { and, asc, eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import {
  academies,
  payments as paymentTable,
  paymentAllocations,
} from "@/db/schema";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import {
  deletePaymentAllocation,
  payChoreographyBalance,
  payChoreographyDeposit,
  payInscriptionDeposit,
  quoteChoreographyDepositTotals,
  readInscriptionDepositOptions,
} from "@/lib/finances/choreography-cobro.server";
import { readChoreographyInscriptionRows } from "@/lib/finances/choreography-inscriptions.server";
import type { OperationalFinanceAmount } from "@/lib/finances/operational-summary";
import type { InscriptionFinancialState } from "@/lib/finances/operational-summary-calculations.server";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";

import {
  deleteAllocationIntent,
  payBalanceIntent,
  payDepositIntent,
  payInscriptionDepositIntent,
  type ChoreographyFinanceActionData,
} from "./shared";

type CobroStage = "deposit" | "balance";
type InscriptionDepositOptions = Awaited<
  ReturnType<typeof readInscriptionDepositOptions>
>;
type AvailablePayment = Awaited<
  ReturnType<typeof listAvailablePayments>
>[number];
type StagePayment = AvailablePayment & { stageTotalAmount: number | null };

export async function loadAdministrativeChoreographyFinanceDetail(input: {
  params: { academyId?: string; choreographyId?: string };
  request: Request;
}) {
  await requireInternalUser(input.request, ["admin", "auditor"]);

  const academyId = readAcademyId(input.params);
  const choreographyId = readChoreographyId(input.params);
  const [academy, eventContext] = await Promise.all([
    readAcademy(academyId),
    loadAdminEventContext(input.request),
  ]);

  if (eventContext.selectedEventId === null) {
    return {
      academy,
      choreography: null,
      inscriptionDeposit: null as InscriptionDepositOptions,
      inscriptions: [],
      payments: [] as StagePayment[],
      stage: null,
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
    throw new Response("No encontramos esa coreografía.", { status: 404 });
  }

  const choreographyInscriptions = financeDetail.inscriptions.filter(
    (inscription) => inscription.choreographyId === choreographyId,
  );
  const inscriptions = await readChoreographyInscriptionRows({
    academyEventInscriptions: financeDetail.inscriptions,
    choreographyId,
  });

  const stage = resolveCobroStage(
    choreographyInscriptions.map((inscription) => inscription.state),
  );
  const inscriptionDeposit = await readInscriptionDepositOptions({
    choreographyId,
    eventId,
  });
  const payments = await attachStageTotals({
    balanceTotal: choreographyFinanceRow.balanceAmount,
    choreographyId,
    eventId,
    payments: await listAvailablePayments({ academyId, eventId }),
    stage,
  });

  return {
    academy,
    choreography: {
      balanceAmount: choreographyFinanceRow.balanceAmount,
      depositAmount: choreographyFinanceRow.depositAmount,
      depositCompletedOn: choreographyFinanceRow.depositCompletedOn,
      financialState: choreographyFinanceRow.financialState,
      groupType: choreographyFinanceRow.groupType,
      id: choreographyFinanceRow.id,
      name: choreographyFinanceRow.name,
      needsAttention: choreographyFinanceRow.needsAttention,
      paidAmount: choreographyFinanceRow.paidAmount,
    },
    inscriptionDeposit,
    inscriptions,
    payments,
    stage,
    selectedEventId: eventId,
  };
}

/**
 * Etapa que se puede cobrar de una coreografía entera. `null` cuando no hay
 * inscripciones o están mezcladas: ahí no hay una sola acción que las resuelva.
 */
function resolveCobroStage(
  states: InscriptionFinancialState[],
): CobroStage | null {
  if (states.length === 0) {
    return null;
  }

  if (states.every((state) => state === "impaga")) {
    return "deposit";
  }

  if (states.every((state) => state === "señada")) {
    return "balance";
  }

  return null;
}

/**
 * Agrega a cada pago el total que tendría que cubrir para saldar la etapa. La
 * seña se cotiza contra la fecha de cada pago, que es la que el cobro usa para
 * elegir la fila de precio: un pago fechado antes de un aumento paga el precio
 * de esa fecha, no el vigente hoy. El saldo no depende de la fecha porque sus
 * insumos ya están congelados. `null` cuando no hay etapa cobrable, cuando falta
 * el precio de esa fecha o cuando alguna inscripción no tiene precio vigente.
 */
async function attachStageTotals(input: {
  balanceTotal: OperationalFinanceAmount;
  choreographyId: string;
  eventId: string;
  payments: AvailablePayment[];
  stage: CobroStage | null;
}): Promise<StagePayment[]> {
  if (input.stage === null) {
    return input.payments.map((payment) => ({
      ...payment,
      stageTotalAmount: null,
    }));
  }

  if (input.stage === "balance") {
    const stageTotalAmount =
      input.balanceTotal.status === "complete"
        ? input.balanceTotal.amount
        : null;

    return input.payments.map((payment) => ({
      ...payment,
      stageTotalAmount,
    }));
  }

  const depositTotals = await quoteChoreographyDepositTotals({
    choreographyId: input.choreographyId,
    eventId: input.eventId,
    referenceDates: input.payments.map((payment) => payment.paymentDate),
  });

  return input.payments.map((payment) => ({
    ...payment,
    stageTotalAmount: depositTotals.get(payment.paymentDate) ?? null,
  }));
}

export async function handleAdministrativeChoreographyFinanceAction(input: {
  params: { academyId?: string; choreographyId?: string };
  request: Request;
}): Promise<ChoreographyFinanceActionData | never> {
  await requireAdminUser(input.request);

  const academyId = readAcademyId(input.params);
  const choreographyId = readChoreographyId(input.params);
  const eventContext = await loadAdminEventContext(input.request);

  if (eventContext.selectedEventId === null) {
    return {
      status: "error",
      message: "Activá un evento para operar la coreografía.",
    };
  }

  const eventId = eventContext.selectedEventId;
  const formData = await input.request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === payDepositIntent || intent === payBalanceIntent) {
    const paymentId = String(formData.get("paymentId") ?? "").trim();
    if (!paymentId) {
      return { status: "error", message: "Elegí un pago para asignar." };
    }

    const result =
      intent === payDepositIntent
        ? await payChoreographyDeposit({
            academyId,
            choreographyId,
            eventId,
            paymentId,
          })
        : await payChoreographyBalance({
            academyId,
            choreographyId,
            eventId,
            paymentId,
          });

    if (!result.ok) {
      return { status: "error", message: result.message };
    }

    throw redirectToDetail(academyId, choreographyId, eventId);
  }

  if (intent === payInscriptionDepositIntent) {
    const inscriptionId = String(formData.get("inscriptionId") ?? "").trim();
    const priceId = String(formData.get("priceId") ?? "").trim();
    const paymentId = String(formData.get("paymentId") ?? "").trim();
    if (!inscriptionId) {
      return { status: "error", message: "Elegí una inscripción para cobrar." };
    }
    if (!priceId) {
      return { status: "error", message: "Elegí una fila de precio." };
    }
    if (!paymentId) {
      return { status: "error", message: "Elegí un pago para asignar." };
    }

    const result = await payInscriptionDeposit({
      academyId,
      choreographyId,
      eventId,
      inscriptionId,
      paymentId,
      priceId,
    });

    if (!result.ok) {
      return { status: "error", message: result.message };
    }

    throw redirectToDetail(academyId, choreographyId, eventId);
  }

  if (intent === deleteAllocationIntent) {
    const allocationId = String(formData.get("allocationId") ?? "").trim();
    if (!allocationId) {
      return { status: "error", message: "No encontramos esa asignación." };
    }

    const result = await deletePaymentAllocation({ allocationId });
    if (!result.ok) {
      return { status: "error", message: result.message };
    }

    throw redirectToDetail(academyId, choreographyId, eventId);
  }

  return { status: "error", message: "No pudimos procesar esa acción." };
}

function redirectToDetail(
  academyId: string,
  choreographyId: string,
  eventId: string,
) {
  return redirect(
    `/administracion/finanzas/${academyId}/coreografias/${choreographyId}?evento=${eventId}`,
  );
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

async function listAvailablePayments(input: {
  academyId: string;
  eventId: string;
}) {
  const [paymentRows, allocationRows] = await Promise.all([
    db
      .select({
        id: paymentTable.id,
        amount: paymentTable.amount,
        paymentDate: paymentTable.paymentDate,
        paymentMethod: paymentTable.paymentMethod,
        paymentNumber: paymentTable.paymentNumber,
      })
      .from(paymentTable)
      .where(
        and(
          eq(paymentTable.academyId, input.academyId),
          eq(paymentTable.eventId, input.eventId),
        ),
      )
      .orderBy(asc(paymentTable.paymentDate)),
    db
      .select({
        paymentId: paymentAllocations.paymentId,
        amount: paymentAllocations.amount,
      })
      .from(paymentAllocations)
      .where(
        and(
          eq(paymentAllocations.academyId, input.academyId),
          eq(paymentAllocations.eventId, input.eventId),
        ),
      ),
  ]);

  const allocatedByPayment = new Map<string, number>();
  for (const allocation of allocationRows) {
    allocatedByPayment.set(
      allocation.paymentId,
      (allocatedByPayment.get(allocation.paymentId) ?? 0) + allocation.amount,
    );
  }

  return paymentRows.map((payment) => ({
    id: payment.id,
    paymentNumber: payment.paymentNumber,
    paymentDate: payment.paymentDate,
    paymentMethod: payment.paymentMethod,
    availableAmount: payment.amount - (allocatedByPayment.get(payment.id) ?? 0),
  }));
}

function readAcademyId(params: { academyId?: string }) {
  if (!params.academyId) {
    throw new Response("No encontramos esa academia.", { status: 404 });
  }

  return params.academyId;
}

function readChoreographyId(params: { choreographyId?: string }) {
  if (!params.choreographyId) {
    throw new Response("No encontramos esa coreografía.", { status: 404 });
  }

  return params.choreographyId;
}
