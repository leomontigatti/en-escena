import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  comprobantePorcion,
  events,
  paymentAllocations,
} from "@/db/schema";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

import { ArcaClient, getArcaClient } from "./arca/client.server";
import {
  DOC_NRO_CONSUMIDOR_FINAL,
  DOC_TIPO_CONSUMIDOR_FINAL,
  FACTURA_C_CBTE_TIPO,
} from "./arca/factura-c";
import type { ServiceDates } from "./arca/factura-c";
import type { ArcaMessage, FacturaCEmissionResult } from "./arca/responses";
import {
  listChoreographyComprobantes,
  recordComprobante,
  type ComprobanteLineInput,
} from "./comprobantes.server";

type ComprobanteRow = Awaited<ReturnType<typeof recordComprobante>>;

// El emisor es Proyecciones Artísticas Asociación Civil, EXENTA frente al IVA
// (#426): siempre emite clase C. El enum del snapshot sólo admite este valor.
export const ISSUER_IVA_CONDITION = "exento" as const;

// Insumos de emisión inyectables: el cliente ARCA (mockeable en tests) y la
// config del punto de venta y receptor. `cbteFch` es opcional; por defecto se
// usa la fecha de negocio de Córdoba en formato ARCA.
export type FacturaCEmissionDeps = {
  client: ArcaClient;
  ptoVta: number;
  issuerCuit: string;
  // Condición IVA del receptor consumidor final, resuelta contra ARCA (#324).
  receptorIvaConditionId: number;
  cbteFch?: string;
};

export type FacturaCEmissionInput = {
  choreographyId: string;
  eventId: string;
};

export type FacturaCEmissionFailureReason =
  | "not-found"
  | "nothing-to-bill"
  | "rejected";

export type FacturaCEmissionOutcome =
  | { ok: true; comprobante: ComprobanteRow }
  | {
      ok: false;
      reason: FacturaCEmissionFailureReason;
      message: string;
      // Presente sólo en un rechazo/contingencia de ARCA.
      arca?: {
        resultado: string | null;
        errors: ArcaMessage[];
        observaciones: ArcaMessage[];
      };
    };

/**
 * Emite una Factura C (`CbteTipo` 11) para una coreografía contra WSFEv1.
 *
 * La factura es un documento DERIVADO (#320): nunca gobierna el estado
 * financiero. Se factura lo efectivamente cobrado (asignaciones de pago) que
 * todavía no cubre ninguna factura tipo 11 vigente de la coreografía, aplicando
 * las derivaciones anti-doble-cobro y de porciones ya facturadas (#323/#326).
 *
 * El `CbteNro` se deriva de `FECompUltimoAutorizado + 1`. Sólo un CAE aprobado
 * persiste el `Comprobante` con su snapshot; un rechazo o contingencia de ARCA
 * no persiste nada ni toca pagos, asignaciones o inscripciones.
 */
export async function emitChoreographyFacturaC(
  input: FacturaCEmissionInput,
  deps: FacturaCEmissionDeps,
): Promise<FacturaCEmissionOutcome> {
  const [choreography] = await db
    .select({
      id: choreographies.id,
      eventId: choreographies.eventId,
      eventStartsAt: events.startsAt,
      eventEndsAt: events.endsAt,
    })
    .from(choreographies)
    .innerJoin(events, eq(events.id, choreographies.eventId))
    .where(eq(choreographies.id, input.choreographyId));

  if (!choreography || choreography.eventId !== input.eventId) {
    return {
      ok: false,
      reason: "not-found",
      message: "No encontramos esa coreografía.",
    };
  }

  const { lines, total, porcion } = await resolveChoreographyBillable(
    input.choreographyId,
  );

  if (total <= 0 || porcion === null) {
    return {
      ok: false,
      reason: "nothing-to-bill",
      message:
        "No hay un monto cobrado pendiente de facturar en esta coreografía.",
    };
  }

  const last = await deps.client.getLastFacturaCNumber(deps.ptoVta);
  const cbteFch = deps.cbteFch ?? toArcaDate(getBusinessDateOnly());

  // Fechas de servicio (Concepto 2, ADR-0011): el período es el del evento y el
  // vencimiento de pago es la fecha del comprobante (se factura lo ya cobrado, así
  // que el pago no vence en el futuro). Congeladas junto con la porción.
  const serviceDates: ServiceDates = {
    fchServDesde: toArcaDate(getBusinessDateOnly(choreography.eventStartsAt)),
    fchServHasta: toArcaDate(getBusinessDateOnly(choreography.eventEndsAt)),
    fchVtoPago: cbteFch,
  };

  const emission = await deps.client.emitFacturaC({
    ptoVta: deps.ptoVta,
    cbteNro: last.nextCbteNro,
    cbteFch,
    importe: total,
    condicionIvaReceptorId: deps.receptorIvaConditionId,
    ...serviceDates,
  });

  if (!emission.approved || !emission.cae || !emission.caeVto) {
    return {
      ok: false,
      reason: "rejected",
      message: buildRejectionMessage(emission),
      arca: {
        resultado: emission.resultado,
        errors: emission.errors,
        observaciones: emission.observaciones,
      },
    };
  }

  const comprobante = await recordComprobante({
    choreographyId: input.choreographyId,
    eventId: input.eventId,
    cbteTipo: FACTURA_C_CBTE_TIPO,
    ptoVta: deps.ptoVta,
    cbteNro: emission.cbteNro ?? last.nextCbteNro,
    cbteFch: emission.cbteFch ?? cbteFch,
    // Porción y fechas de servicio DERIVADAS y CONGELADAS: reimputar un pago
    // después de emitir no altera lo que dice este comprobante (ADR-0011, #479).
    porcion,
    ...serviceDates,
    impTotal: total,
    issuerCuit: deps.issuerCuit,
    issuerIvaCondition: ISSUER_IVA_CONDITION,
    receptorDocTipo: DOC_TIPO_CONSUMIDOR_FINAL,
    receptorDocNro: String(DOC_NRO_CONSUMIDOR_FINAL),
    receptorIvaConditionId: deps.receptorIvaConditionId,
    cae: emission.cae,
    caeVto: emission.caeVto,
    lines,
  });

  return { ok: true, comprobante };
}

export type ComprobantePorcion = (typeof comprobantePorcion.enumValues)[number];

export type ChoreographyBillable = {
  lines: ComprobanteLineInput[];
  total: number;
  // Porción que cubre el remanente facturable, DERIVADA de los tipos de
  // asignación (#479, ADR-0011). `null` cuando no hay nada por facturar.
  porcion: ComprobantePorcion | null;
};

/**
 * Monto facturable de una coreografía: sus líneas internas por inscripción con
 * remanente positivo, el total y la PORCIÓN que ese remanente cubre. Es lo que la
 * UX de emisión (#447) previsualiza antes de confirmar y lo que
 * `emitChoreographyFacturaC` factura. No llama a ARCA: sólo cruza cobros contra
 * facturas vigentes.
 */
export async function resolveChoreographyBillable(
  choreographyId: string,
): Promise<ChoreographyBillable> {
  const inscriptionRows = await db
    .select({ id: choreographyDancers.id })
    .from(choreographyDancers)
    .where(eq(choreographyDancers.choreographyId, choreographyId));

  const { lines, depositPaid, balancePaid, billed } = await resolveBillable(
    choreographyId,
    inscriptionRows.map((row) => row.id),
  );
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const porcion = derivePorcion({ depositPaid, balancePaid, billed });

  return { lines, total, porcion };
}

/**
 * Deriva la porción del remanente facturable a partir de lo cobrado por tipo de
 * asignación y lo ya facturado. El cobro es atómico a nivel coreografía (para
 * señar, todas las inscripciones impagas; para saldar, todas señadas) y la seña
 * se factura antes que el saldo, así que lo facturado cubre primero el depósito:
 * el remanente nunca es mixto y `{seña, saldo, total}` cubre el espacio real.
 */
function derivePorcion(input: {
  depositPaid: number;
  balancePaid: number;
  billed: number;
}): ComprobantePorcion | null {
  const { depositPaid, balancePaid, billed } = input;
  const uncoveredDeposit = Math.max(0, depositPaid - billed);
  const uncoveredBalance = Math.max(
    0,
    balancePaid - Math.max(0, billed - depositPaid),
  );

  if (uncoveredDeposit > 0 && uncoveredBalance > 0) {
    return "total";
  }
  if (uncoveredDeposit > 0) {
    return "seña";
  }
  if (uncoveredBalance > 0) {
    return "saldo";
  }
  return null;
}

type BillableResolution = {
  lines: ComprobanteLineInput[];
  // Cobrado por tipo de asignación, agregado a nivel coreografía: insumos de la
  // derivación de porción.
  depositPaid: number;
  balancePaid: number;
  // Total ya facturado por facturas tipo 11 vigentes.
  billed: number;
};

/**
 * Porción facturable de cada inscripción: lo cobrado (asignaciones de pago) menos
 * lo ya cubierto por facturas tipo 11 VIGENTES de la coreografía. Sólo entran las
 * inscripciones con remanente positivo. Una factura anulada deja de contar como
 * facturada (su estado deriva de la Nota de crédito), así que su monto vuelve a
 * ser facturable. Además agrega lo cobrado por tipo (`deposit`/`balance`) y el
 * total facturado, insumos de los que se deriva la porción del remanente.
 */
async function resolveBillable(
  choreographyId: string,
  inscriptionIds: string[],
): Promise<BillableResolution> {
  if (inscriptionIds.length === 0) {
    return { lines: [], depositPaid: 0, balancePaid: 0, billed: 0 };
  }

  const allocations = await db
    .select({
      inscriptionId: paymentAllocations.inscriptionId,
      allocationType: paymentAllocations.allocationType,
      amount: paymentAllocations.amount,
    })
    .from(paymentAllocations)
    .where(inArray(paymentAllocations.inscriptionId, inscriptionIds));

  const paidByInscription = sumByInscription(allocations);
  let depositPaid = 0;
  let balancePaid = 0;
  for (const allocation of allocations) {
    if (allocation.allocationType === "deposit") {
      depositPaid += allocation.amount;
    } else {
      balancePaid += allocation.amount;
    }
  }

  const existing = await listChoreographyComprobantes(choreographyId);
  const billedByInscription = new Map<string, number>();
  for (const comprobante of existing) {
    if (
      comprobante.cbteTipo !== FACTURA_C_CBTE_TIPO ||
      comprobante.status !== "vigente"
    ) {
      continue;
    }
    for (const line of comprobante.lines) {
      if (line.inscriptionId === null) {
        continue;
      }
      billedByInscription.set(
        line.inscriptionId,
        (billedByInscription.get(line.inscriptionId) ?? 0) + line.amount,
      );
    }
  }

  const lines: ComprobanteLineInput[] = [];
  let billed = 0;
  for (const inscriptionId of inscriptionIds) {
    const paid = paidByInscription.get(inscriptionId) ?? 0;
    const inscriptionBilled = billedByInscription.get(inscriptionId) ?? 0;
    billed += inscriptionBilled;
    const billable = paid - inscriptionBilled;
    if (billable > 0) {
      lines.push({ inscriptionId, amount: billable });
    }
  }

  return { lines, depositPaid, balancePaid, billed };
}

function sumByInscription(
  allocations: Array<{ inscriptionId: string; amount: number }>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const allocation of allocations) {
    totals.set(
      allocation.inscriptionId,
      (totals.get(allocation.inscriptionId) ?? 0) + allocation.amount,
    );
  }
  return totals;
}

export function buildRejectionMessage(
  emission: FacturaCEmissionResult,
): string {
  const detail =
    emission.errors[0]?.msg ??
    emission.observaciones[0]?.msg ??
    emission.resultado ??
    "sin detalle";

  return `ARCA no autorizó el comprobante (${detail}).`;
}

// Fecha de negocio `AAAA-MM-DD` → formato ARCA `AAAAMMDD`.
export function toArcaDate(dateOnly: string): string {
  return dateOnly.replace(/-/g, "");
}

/**
 * Resuelve los insumos de emisión de producción desde el entorno: el cliente
 * ARCA compartido (con su cache de TA) más el punto de venta y la condición IVA
 * del receptor. La UX de emisión (#447) consume esto; los tests inyectan un
 * cliente mockeado y no pasan por acá.
 */
export function getFacturaCEmissionDeps(
  env: NodeJS.ProcessEnv = process.env,
): FacturaCEmissionDeps {
  return {
    client: getArcaClient(env),
    ...readFacturaCEmissionConfig(env),
  };
}

export function readFacturaCEmissionConfig(
  env: NodeJS.ProcessEnv = process.env,
): Pick<
  FacturaCEmissionDeps,
  "ptoVta" | "issuerCuit" | "receptorIvaConditionId"
> {
  return {
    ptoVta: requirePositiveIntEnv(env, "ARCA_PTOVTA"),
    issuerCuit: requireEnv(env, "ARCA_CUIT"),
    receptorIvaConditionId: requirePositiveIntEnv(
      env,
      "ARCA_CONDICION_IVA_RECEPTOR_ID",
    ),
  };
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }
  return value;
}

function requirePositiveIntEnv(env: NodeJS.ProcessEnv, name: string): number {
  const raw = requireEnv(env, name);
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name}="${raw}" no es un entero positivo.`);
  }
  return value;
}
