import { eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  comprobantePorcion,
  events,
  paymentAllocations,
} from "@/db/schema";
import { choreographyNotFoundMessage } from "@/lib/choreographies/choreography-messages";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

import { ArcaClient, getArcaClient } from "./arca/client.server";
import type { ArcaAttemptedVoucher } from "./arca/contingency.server";
import {
  emitWithContingency,
  recheckWithContingency,
  toArcaDate,
  type ArcaEmissionChoreography,
  type ArcaEmissionOutcome,
} from "./arca/emission.server";
import {
  DOC_NRO_CONSUMIDOR_FINAL,
  DOC_TIPO_CONSUMIDOR_FINAL,
  FACTURA_C_CBTE_TIPO,
} from "./arca/factura-c";
import type { ServiceDates } from "./arca/factura-c";
import type { ArcaMessage } from "./arca/responses";
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
  // ARCA respondió y no autorizó.
  | "rejected"
  // ARCA no respondió y quedó establecido que no se emitió nada: reintentar es
  // seguro (ADR-0012 decisión 6).
  | "not-emitted"
  // ARCA no respondió y la consulta posterior tampoco resolvió qué pasó.
  | "unverified";

export type FacturaCEmissionOutcome =
  | {
      ok: true;
      comprobante: ComprobanteRow;
      // El CAE se recuperó consultando a ARCA después de una autorización sin
      // respuesta, en lugar de venir de `FECAESolicitar` (#577).
      recovered: boolean;
    }
  | {
      ok: false;
      reason: FacturaCEmissionFailureReason;
      message: string;
      // Presente sólo en un rechazo de ARCA.
      arca?: {
        resultado: string | null;
        errors: ArcaMessage[];
        observaciones: ArcaMessage[];
      };
      // Presente sólo en `unverified`: el comprobante que no se pudo resolver.
      attempt?: ArcaAttemptedVoucher;
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
 * persiste el `Comprobante` con su snapshot; un rechazo de ARCA no persiste nada
 * ni toca pagos, asignaciones o inscripciones.
 *
 * Si ARCA no responde, la falla se clasifica por fase (ADR-0012). Cortada la
 * consulta del correlativo no se autorizó nada. Cortada la autorización se
 * consulta a ARCA por el comprobante exacto que se intentó: si aparece y
 * coincide con lo enviado, SÍ se había autorizado y se persiste con ese CAE —la
 * única excepción a la invariante de que una contingencia no persiste nada, y
 * existe porque la fila corresponde a un documento fiscal que demostrablemente
 * está en ARCA—; si no aparece y la autorización había fallado en el transporte,
 * no se emitió nada. Si la consulta falla, devuelve otro comprobante, o no lo
 * encuentra pero la autorización venció por timeout —y entonces sigue en vuelo,
 * pudiendo autorizarse después—, el resultado es `unverified` y no se persiste
 * nada.
 */
export async function emitChoreographyFacturaC(
  input: FacturaCEmissionInput,
  deps: FacturaCEmissionDeps,
): Promise<FacturaCEmissionOutcome> {
  const resolved = await resolveFacturaCChoreography(input, deps);

  if (!resolved.ok) {
    return resolved;
  }

  const emission = await emitWithContingency(resolved.choreography);

  return toFacturaCOutcome(emission);
}

/**
 * Re-verifica contra ARCA una emisión que quedó sin resolver (#577), para el
 * correlativo que el diálogo trae del intento anterior. Vuelve a derivar el
 * facturable de la coreografía —de ahí sale el importe contra el que se valida
 * el comprobante consultado— así que si alguien tocó las asignaciones en el
 * medio, el importe no coincide y el resultado se queda en `unverified`.
 */
export async function recheckChoreographyFacturaC(
  input: FacturaCEmissionInput & { cbteNro: number },
  deps: FacturaCEmissionDeps,
): Promise<FacturaCEmissionOutcome> {
  const resolved = await resolveFacturaCChoreography(input, deps);

  if (!resolved.ok) {
    return resolved;
  }

  const emission = await recheckWithContingency(
    resolved.choreography,
    input.cbteNro,
  );

  return toFacturaCOutcome(emission);
}

function toFacturaCOutcome(
  emission: ArcaEmissionOutcome<ComprobanteRow>,
): FacturaCEmissionOutcome {
  return emission.ok
    ? {
        ok: true,
        comprobante: emission.voucher,
        recovered: emission.recovered,
      }
    : emission;
}

/**
 * Arma la coreografía de emisión de la Factura C: valida el ancla, deriva el
 * facturable y congela las fechas de servicio. La comparten la emisión y la
 * re-verificación, que necesita exactamente los mismos insumos —el importe y la
 * fecha con los que se valida un comprobante recuperado (ADR-0012 decisión 4)—
 * calculados en el server y no traídos del form.
 */
async function resolveFacturaCChoreography(
  input: FacturaCEmissionInput,
  deps: FacturaCEmissionDeps,
): Promise<
  | { ok: true; choreography: ArcaEmissionChoreography<ComprobanteRow> }
  | Extract<FacturaCEmissionOutcome, { ok: false }>
> {
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
      message: choreographyNotFoundMessage,
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

  // Fechas de servicio (Concepto 2, ADR-0011): el período es el del evento y el
  // vencimiento de pago es la fecha del comprobante (se factura lo ya cobrado, así
  // que el pago no vence en el futuro). Congeladas junto con la porción.
  const serviceDates = (cbteFch: string): ServiceDates => ({
    fchServDesde: toArcaDate(getBusinessDateOnly(choreography.eventStartsAt)),
    fchServHasta: toArcaDate(getBusinessDateOnly(choreography.eventEndsAt)),
    fchVtoPago: cbteFch,
  });

  const choreographyCall: ArcaEmissionChoreography<ComprobanteRow> = {
    client: deps.client,
    subject: "comprobante",
    ptoVta: deps.ptoVta,
    cbteTipo: FACTURA_C_CBTE_TIPO,
    cbteFch: deps.cbteFch,
    impTotal: total,
    getLastNumber: () => deps.client.getLastFacturaCNumber(deps.ptoVta),
    emit: (request) =>
      deps.client.emitFacturaC({
        ptoVta: deps.ptoVta,
        cbteNro: request.cbteNro,
        cbteFch: request.cbteFch,
        importe: total,
        condicionIvaReceptorId: deps.receptorIvaConditionId,
        ...serviceDates(request.cbteFch),
      }),
    persist: (authorized, request): Promise<ComprobanteRow> =>
      recordComprobante({
        choreographyId: input.choreographyId,
        eventId: input.eventId,
        cbteTipo: FACTURA_C_CBTE_TIPO,
        ptoVta: deps.ptoVta,
        cbteNro: authorized.cbteNro,
        cbteFch: authorized.cbteFch,
        // Porción y fechas de servicio DERIVADAS y CONGELADAS: reimputar un pago
        // después de emitir no altera lo que dice este comprobante (ADR-0011, #479).
        porcion,
        ...serviceDates(request.cbteFch),
        impTotal: total,
        issuerCuit: deps.issuerCuit,
        issuerIvaCondition: ISSUER_IVA_CONDITION,
        receptorDocTipo: DOC_TIPO_CONSUMIDOR_FINAL,
        receptorDocNro: String(DOC_NRO_CONSUMIDOR_FINAL),
        receptorIvaConditionId: deps.receptorIvaConditionId,
        cae: authorized.cae,
        caeVto: authorized.caeVto,
        lines,
      }),
  };

  return { ok: true, choreography: choreographyCall };
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
    .select({
      depositAmount: choreographyDancers.depositAmount,
      id: choreographyDancers.id,
    })
    .from(choreographyDancers)
    .where(eq(choreographyDancers.choreographyId, choreographyId));

  const { lines, depositPaid, balancePaid, billed } = await resolveBillable(
    choreographyId,
    inscriptionRows,
  );
  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  const porcion = derivePorcion({ depositPaid, balancePaid, billed });

  return { lines, total, porcion };
}

/**
 * Deriva la porción del remanente facturable a partir de lo cobrado contra el
 * umbral de seña y lo ya facturado. La asignación no tiene rol: lo cobrado cubre
 * primero la seña de cada inscripción y el excedente es saldo. El cobro es
 * atómico a nivel coreografía y la seña se factura antes que el saldo, así que
 * lo facturado cubre primero el depósito: el remanente nunca es mixto y
 * `{seña, saldo, total}` cubre el espacio real.
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
  // Cobrado contra la seña y por encima de ella, agregado a nivel coreografía:
  // insumos de la derivación de porción.
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
 * ser facturable. Además agrega lo cobrado contra la seña y por encima de ella,
 * más el total facturado: insumos de los que se deriva la porción del remanente.
 */
async function resolveBillable(
  choreographyId: string,
  inscriptions: Array<{ depositAmount: number | null; id: string }>,
): Promise<BillableResolution> {
  if (inscriptions.length === 0) {
    return { lines: [], depositPaid: 0, balancePaid: 0, billed: 0 };
  }

  const allocations = await db
    .select({
      inscriptionId: paymentAllocations.inscriptionId,
      amount: paymentAllocations.amount,
    })
    .from(paymentAllocations)
    .where(
      inArray(
        paymentAllocations.inscriptionId,
        inscriptions.map((inscription) => inscription.id),
      ),
    );

  const paidByInscription = sumByInscription(allocations);
  let depositPaid = 0;
  let balancePaid = 0;
  for (const inscription of inscriptions) {
    const paid = paidByInscription.get(inscription.id) ?? 0;
    const coveredDeposit = Math.min(paid, inscription.depositAmount ?? paid);
    depositPaid += coveredDeposit;
    balancePaid += paid - coveredDeposit;
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
  for (const inscription of inscriptions) {
    const paid = paidByInscription.get(inscription.id) ?? 0;
    const inscriptionBilled = billedByInscription.get(inscription.id) ?? 0;
    billed += inscriptionBilled;
    const billable = paid - inscriptionBilled;
    if (billable > 0) {
      lines.push({ inscriptionId: inscription.id, amount: billable });
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
