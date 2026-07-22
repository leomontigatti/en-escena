import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  paymentAllocations,
} from "@/db/schema";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

import { ArcaClient, getArcaClient } from "./arca/client.server";
import {
  DOC_NRO_CONSUMIDOR_FINAL,
  DOC_TIPO_CONSUMIDOR_FINAL,
  FACTURA_C_CBTE_TIPO,
} from "./arca/factura-c";
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
    .select({ id: choreographies.id, eventId: choreographies.eventId })
    .from(choreographies)
    .where(eq(choreographies.id, input.choreographyId));

  if (!choreography || choreography.eventId !== input.eventId) {
    return {
      ok: false,
      reason: "not-found",
      message: "No encontramos esa coreografía.",
    };
  }

  const { lines, total } = await resolveChoreographyBillable(
    input.choreographyId,
  );

  if (total <= 0) {
    return {
      ok: false,
      reason: "nothing-to-bill",
      message:
        "No hay un monto cobrado pendiente de facturar en esta coreografía.",
    };
  }

  const last = await deps.client.getLastFacturaCNumber(deps.ptoVta);
  const cbteFch = deps.cbteFch ?? toArcaDate(getBusinessDateOnly());

  const emission = await deps.client.emitFacturaC({
    ptoVta: deps.ptoVta,
    cbteNro: last.nextCbteNro,
    cbteFch,
    importe: total,
    condicionIvaReceptorId: deps.receptorIvaConditionId,
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

export type ChoreographyBillable = {
  lines: ComprobanteLineInput[];
  total: number;
};

/**
 * Monto facturable de una coreografía: sus líneas internas por inscripción con
 * remanente positivo y el total. Es lo que la UX de emisión (#447) previsualiza
 * antes de confirmar y lo que `emitChoreographyFacturaC` factura. No llama a
 * ARCA: sólo cruza cobros contra facturas vigentes.
 */
export async function resolveChoreographyBillable(
  choreographyId: string,
): Promise<ChoreographyBillable> {
  const inscriptionRows = await db
    .select({ id: choreographyDancers.id })
    .from(choreographyDancers)
    .where(eq(choreographyDancers.choreographyId, choreographyId));

  const lines = await resolveBillableLines(
    choreographyId,
    inscriptionRows.map((row) => row.id),
  );
  const total = lines.reduce((sum, line) => sum + line.amount, 0);

  return { lines, total };
}

/**
 * Porción facturable de cada inscripción: lo cobrado (asignaciones de pago) menos
 * lo ya cubierto por facturas tipo 11 VIGENTES de la coreografía. Sólo entran las
 * inscripciones con remanente positivo. Una factura anulada deja de contar como
 * facturada (su estado deriva de la Nota de crédito), así que su monto vuelve a
 * ser facturable.
 */
async function resolveBillableLines(
  choreographyId: string,
  inscriptionIds: string[],
): Promise<ComprobanteLineInput[]> {
  if (inscriptionIds.length === 0) {
    return [];
  }

  const allocations = await db
    .select({
      inscriptionId: paymentAllocations.inscriptionId,
      amount: paymentAllocations.amount,
    })
    .from(paymentAllocations)
    .where(inArray(paymentAllocations.inscriptionId, inscriptionIds));

  const paidByInscription = sumByInscription(allocations);

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
  for (const inscriptionId of inscriptionIds) {
    const paid = paidByInscription.get(inscriptionId) ?? 0;
    const billed = billedByInscription.get(inscriptionId) ?? 0;
    const billable = paid - billed;
    if (billable > 0) {
      lines.push({ inscriptionId, amount: billable });
    }
  }

  return lines;
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
