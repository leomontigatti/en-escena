import { and, asc, eq, inArray } from "drizzle-orm";
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
import { FACTURA_C_CBTE_TIPO } from "@/lib/comprobantes/arca/factura-c";
import type { ArcaMessage } from "@/lib/comprobantes/arca/responses";
import { listChoreographyComprobantes } from "@/lib/comprobantes/comprobantes.server";
import {
  emitChoreographyFacturaC,
  getFacturaCEmissionDeps,
  resolveChoreographyBillable,
  type ComprobantePorcion,
  type FacturaCEmissionDeps,
} from "@/lib/comprobantes/emit-factura-c.server";
import {
  deletePaymentAllocation,
  payChoreographyBalance,
  payChoreographyDeposit,
  payInscriptionBalance,
  payInscriptionDeposit,
  quoteChoreographyDepositTotals,
  readInscriptionDepositOptions,
} from "@/lib/finances/choreography-cobro.server";
import {
  readChoreographyInscriptionRows,
  type ChoreographyInscriptionRow,
} from "@/lib/finances/choreography-inscriptions.server";
import type { OperationalFinanceAmount } from "@/lib/finances/operational-summary";
import type { InscriptionFinancialState } from "@/lib/finances/operational-summary-calculations.server";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";

import {
  deleteAllocationIntent,
  emitComprobanteConfirmValue,
  emitComprobanteIntent,
  payBalanceIntent,
  payDepositIntent,
  payInscriptionBalanceIntent,
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
      canPayInscriptionBalance: false,
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
  const inscriptions = await attachUndoableAllocations(
    await readChoreographyInscriptionRows({
      academyEventInscriptions: financeDetail.inscriptions,
      choreographyId,
    }),
  );

  const stage = resolveCobroStage(
    choreographyInscriptions.map((inscription) => inscription.state),
  );
  const inscriptionDeposit = await readInscriptionDepositOptions({
    choreographyId,
    eventId,
  });
  const canPayInscriptionBalance = resolveInscriptionBalanceEligibility(
    choreographyInscriptions.map((inscription) => inscription.state),
  );
  const payments = await attachStageTotals({
    balanceTotal: choreographyFinanceRow.balanceAmount,
    choreographyId,
    eventId,
    payments: await listAvailablePayments({ academyId, eventId }),
    stage,
  });
  const invoicing = await readChoreographyInvoicing(choreographyId);

  return {
    academy,
    invoicing,
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
    canPayInscriptionBalance,
    inscriptionDeposit,
    inscriptions,
    payments,
    stage,
    selectedEventId: eventId,
  };
}

export type ComprobanteCurrency = "vigente" | "desactualizada";

// Comprobante VIGENTE que cubre una porción (seña o saldo) de la coreografía:
// su id (destino del botón de la MetricCard) y su badge frente al cobro actual.
// `null` cuando ninguna factura vigente cubre esa porción —incluido el caso en
// que la única que la cubría fue anulada: ahí badge y botón desaparecen, no hay
// estado `Anulado` (ADR-0011).
export type PortionCoverage = {
  comprobanteId: string;
  currency: ComprobanteCurrency;
};

export type ChoreographyInvoicing = {
  // Remanente cobrado todavía no cubierto por una factura vigente. La emisión
  // factura exactamente esto (#446); la UX lo previsualiza.
  billableAmount: number;
  // Porción que cubriría la emisión, DERIVADA de lo cobrado (#480, ADR-0011): la
  // UX la previsualiza junto con el importe para que la operadora vea qué va a
  // emitir sin poder elegirla. `null` cuando no hay remanente por facturar.
  porcion: ComprobantePorcion | null;
  // Hay algo para facturar: la afordancia de emisión sólo se habilita con
  // remanente.
  canEmit: boolean;
  // Comprobante vigente que cubre cada porción, para las MetricCards de Seña y
  // Saldo del detalle (ADR-0011). Una factura `total` cubre ambas, así que las
  // dos apuntan al mismo comprobante.
  sena: PortionCoverage | null;
  saldo: PortionCoverage | null;
};

/**
 * Cruza los comprobantes de la coreografía con su monto facturable para armar el
 * eje de emisión del detalle: la porción facturable derivada, si queda algo por
 * facturar, y el comprobante vigente que cubre cada porción (Seña/Saldo). El badge
 * de cada porción deriva del remanente, no de una columna: es `vigente` cuando la
 * factura vigente ya cubre todo el cobro de esa porción y `desactualizada` cuando
 * entró cobro nuevo sin facturar en ella.
 */
async function readChoreographyInvoicing(
  choreographyId: string,
): Promise<ChoreographyInvoicing> {
  const [comprobantes, billable] = await Promise.all([
    listChoreographyComprobantes(choreographyId),
    resolveChoreographyBillable(choreographyId),
  ]);

  const vigentesFacturas = comprobantes.filter(
    (comprobante) =>
      comprobante.cbteTipo === FACTURA_C_CBTE_TIPO &&
      comprobante.status === "vigente",
  );

  const billableCovers = (porcion: "seña" | "saldo") =>
    billable.porcion === porcion || billable.porcion === "total";

  return {
    billableAmount: billable.total,
    porcion: billable.porcion,
    // Espeja la precondición de emisión del server (`emitChoreographyFacturaC`):
    // exige remanente Y porción derivable. Pueden divergir si una asignación de
    // pago se borra después de emitir y deja una línea facturada huérfana que
    // hace `billed >= cobrado` agregado mientras otra inscripción todavía tiene
    // remanente: ahí `total > 0` pero `porcion === null`. Sin este `&&`, el botón
    // quedaría habilitado y la confirmación fallaría con un error genérico.
    canEmit: billable.total > 0 && billable.porcion !== null,
    sena: resolvePortionCoverage(
      vigentesFacturas,
      "seña",
      billableCovers("seña"),
    ),
    saldo: resolvePortionCoverage(
      vigentesFacturas,
      "saldo",
      billableCovers("saldo"),
    ),
  };
}

/**
 * Comprobante vigente que cubre una porción: el más reciente cuya `porcion`
 * coincide o es `total` (una factura total cubre seña y saldo). El badge es
 * `desactualizada` cuando el remanente facturable incluye esa porción —entró
 * cobro nuevo sin facturar— y `vigente` cuando la factura ya la cubre entera.
 */
function resolvePortionCoverage(
  vigentesFacturas: { id: string; porcion: ComprobantePorcion }[],
  porcion: "seña" | "saldo",
  billableCoversPortion: boolean,
): PortionCoverage | null {
  const covering = vigentesFacturas
    .filter(
      (factura) => factura.porcion === porcion || factura.porcion === "total",
    )
    .at(-1);

  if (!covering) {
    return null;
  }

  return {
    comprobanteId: covering.id,
    currency: billableCoversPortion ? "desactualizada" : "vigente",
  };
}

/**
 * Si una inscripción `señada` huérfana puede cobrarse el saldo por fila. Solo en
 * coreografías mixtas: hay al menos una `señada` y alguna hermana en otro estado,
 * así que el flujo normal por coreografía entera (todas `señadas`) no aplica.
 */
function resolveInscriptionBalanceEligibility(
  states: InscriptionFinancialState[],
): boolean {
  return (
    states.some((state) => state === "señada") &&
    states.some((state) => state !== "señada")
  );
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

type UndoableAllocationStage = "deposit" | "balance";
type InscriptionRowWithUndo = ChoreographyInscriptionRow & {
  undoableAllocation: { id: string; stage: UndoableAllocationStage } | null;
};

/**
 * Anota a cada inscripción con la asignación que su fila puede deshacer. Deshacer
 * baja una etapa: la `balance` (si existe) vuelve la inscripción a `señada`, y la
 * `deposit` la vuelve a `impaga`. Por eso se ofrece la etapa más alta —`balance`
 * antes que `deposit`—, que es la que el server permite borrar primero.
 */
async function attachUndoableAllocations(
  inscriptions: ChoreographyInscriptionRow[],
): Promise<InscriptionRowWithUndo[]> {
  const inscriptionIds = inscriptions
    .map((row) => row.inscriptionId)
    .filter((id): id is string => id !== null);

  if (inscriptionIds.length === 0) {
    return inscriptions.map((row) => ({ ...row, undoableAllocation: null }));
  }

  const allocationRows = await db
    .select({
      id: paymentAllocations.id,
      inscriptionId: paymentAllocations.inscriptionId,
      allocationType: paymentAllocations.allocationType,
    })
    .from(paymentAllocations)
    .where(inArray(paymentAllocations.inscriptionId, inscriptionIds));

  return inscriptions.map((row) => ({
    ...row,
    undoableAllocation: resolveUndoableAllocation(
      row.inscriptionId,
      allocationRows,
    ),
  }));
}

function resolveUndoableAllocation(
  inscriptionId: string | null,
  allocationRows: {
    id: string;
    inscriptionId: string;
    allocationType: UndoableAllocationStage;
  }[],
): { id: string; stage: UndoableAllocationStage } | null {
  if (inscriptionId === null) {
    return null;
  }

  const own = allocationRows.filter(
    (allocation) => allocation.inscriptionId === inscriptionId,
  );
  const balance = own.find(
    (allocation) => allocation.allocationType === "balance",
  );
  if (balance) {
    return { id: balance.id, stage: "balance" };
  }

  const deposit = own.find(
    (allocation) => allocation.allocationType === "deposit",
  );
  if (deposit) {
    return { id: deposit.id, stage: "deposit" };
  }

  return null;
}

export async function handleAdministrativeChoreographyFinanceAction(input: {
  params: { academyId?: string; choreographyId?: string };
  request: Request;
  // Insumos de emisión inyectables: los tests pasan un cliente ARCA mockeado;
  // en producción se resuelven desde el entorno (cert+key, punto de venta).
  resolveEmissionDeps?: () => FacturaCEmissionDeps;
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

  if (intent === payInscriptionBalanceIntent) {
    const inscriptionId = String(formData.get("inscriptionId") ?? "").trim();
    const paymentId = String(formData.get("paymentId") ?? "").trim();
    if (!inscriptionId) {
      return { status: "error", message: "Elegí una inscripción para cobrar." };
    }
    if (!paymentId) {
      return { status: "error", message: "Elegí un pago para asignar." };
    }

    const result = await payInscriptionBalance({
      academyId,
      choreographyId,
      eventId,
      inscriptionId,
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

  if (intent === emitComprobanteIntent) {
    return await handleEmitComprobante({
      academyId,
      choreographyId,
      confirm: String(formData.get("confirm") ?? ""),
      eventId,
      resolveEmissionDeps: input.resolveEmissionDeps ?? getFacturaCEmissionDeps,
    });
  }

  return { status: "error", message: "No pudimos procesar esa acción." };
}

/**
 * Dispara la emisión de la Factura C tras la confirmación irreversible. Un CAE
 * aprobado recarga el detalle (badge Vigente); un rechazo o contingencia de ARCA
 * vuelve como `emission-error` con el estado crudo, sin persistir nada ni dejar
 * la UI inconsistente (la recarga sólo ocurre en el camino feliz).
 */
async function handleEmitComprobante(input: {
  academyId: string;
  choreographyId: string;
  confirm: string;
  eventId: string;
  resolveEmissionDeps: () => FacturaCEmissionDeps;
}): Promise<ChoreographyFinanceActionData | never> {
  if (input.confirm !== emitComprobanteConfirmValue) {
    return {
      status: "error",
      message: "Confirmá la emisión irreversible para continuar.",
    };
  }

  const outcome = await emitChoreographyFacturaC(
    { choreographyId: input.choreographyId, eventId: input.eventId },
    input.resolveEmissionDeps(),
  );

  if (outcome.ok) {
    throw redirectToDetail(
      input.academyId,
      input.choreographyId,
      input.eventId,
    );
  }

  if (outcome.reason === "rejected") {
    return {
      status: "emission-error",
      message: outcome.message,
      contingency: {
        resultado: outcome.arca?.resultado ?? null,
        errors: (outcome.arca?.errors ?? []).map(formatArcaMessage),
        observaciones: (outcome.arca?.observaciones ?? []).map(
          formatArcaMessage,
        ),
      },
    };
  }

  return { status: "error", message: outcome.message };
}

function formatArcaMessage(message: ArcaMessage): string {
  return message.code ? `${message.msg} (código ${message.code})` : message.msg;
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
