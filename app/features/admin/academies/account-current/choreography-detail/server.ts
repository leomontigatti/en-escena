import { and, asc, eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import {
  academies,
  payments as paymentTable,
  choreographyDancers,
  dancers,
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
} from "@/lib/finances/choreography-cobro.server";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";

import {
  deleteAllocationIntent,
  payBalanceIntent,
  payDepositIntent,
  type ChoreographyFinanceActionData,
} from "./shared";

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
      inscriptions: [],
      payments: [],
      canPayDeposit: false,
      canPayBalance: false,
      depositTotal: 0,
      balanceTotal: 0,
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
  const inscriptionsByDancer = new Map(
    choreographyInscriptions.map((inscription) => [
      inscription.dancerId,
      inscription,
    ]),
  );
  const participationRows = await listChoreographyParticipationRows({
    choreographyId,
  });

  const inscriptions = participationRows.map((participation) => {
    const inscription = inscriptionsByDancer.get(participation.dancerId);

    return {
      dancerId: participation.dancerId,
      firstName: participation.firstName,
      lastName: participation.lastName,
      state: inscription?.state ?? "impaga",
      basePriceAmount: inscription?.basePriceAmount ?? null,
      depositAmount: inscription?.depositAmount ?? null,
      balanceAmount: inscription?.balanceAmount ?? null,
      discountAmount: inscription?.dancerDiscountAmount ?? 0,
      finalPriceAmount: inscription?.finalPriceAmount ?? null,
    };
  });

  const states = choreographyInscriptions.map(
    (inscription) => inscription.state,
  );
  const canPayDeposit =
    states.length > 0 && states.every((state) => state === "impaga");
  const canPayBalance =
    states.length > 0 && states.every((state) => state === "señada");
  // Totales de la etapa a cobrar. Se derivan de la fila de coreografía, que ya
  // sumó los importes de las inscripciones, en vez de volver a sumarlos acá.
  const depositTotal = choreographyFinanceRow.depositAmount.amount;
  const balanceTotal = choreographyFinanceRow.balanceAmount.amount;

  const payments = await listAvailablePayments({ academyId, eventId });

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
    inscriptions,
    payments,
    canPayDeposit,
    canPayBalance,
    depositTotal,
    balanceTotal,
    selectedEventId: eventId,
  };
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

async function listChoreographyParticipationRows(input: {
  choreographyId: string;
}) {
  return await db
    .select({
      dancerId: dancers.id,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
    })
    .from(choreographyDancers)
    .innerJoin(dancers, eq(choreographyDancers.dancerId, dancers.id))
    .where(eq(choreographyDancers.choreographyId, input.choreographyId))
    .orderBy(asc(dancers.lastName), asc(dancers.firstName));
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
