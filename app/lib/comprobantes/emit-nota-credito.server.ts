import { eq } from "drizzle-orm";

import { db } from "@/db";
import { comprobantes } from "@/db/schema";
import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

import {
  DOC_NRO_CONSUMIDOR_FINAL,
  DOC_TIPO_CONSUMIDOR_FINAL,
  NOTA_CREDITO_C_CBTE_TIPO,
} from "./arca/factura-c";
import type { ArcaMessage } from "./arca/responses";
import {
  buildRejectionMessage,
  ISSUER_IVA_CONDITION,
  toArcaDate,
  type FacturaCEmissionDeps,
} from "./emit-factura-c.server";
import {
  listChoreographyComprobantes,
  recordComprobante,
  type ComprobanteWithLines,
} from "./comprobantes.server";

type ComprobanteRow = Awaited<ReturnType<typeof recordComprobante>>;

// La anulación reutiliza los mismos insumos de emisión que la Factura C: el
// cliente ARCA (mockeable), el punto de venta, el CUIT emisor y la condición IVA
// del receptor. La Nota de crédito corre por su propia serie de correlativos.
export type NotaCreditoEmissionInput = {
  comprobanteId: string;
};

export type NotaCreditoEmissionFailureReason =
  | "not-found"
  | "already-annulled"
  | "rejected";

export type NotaCreditoEmissionOutcome =
  | { ok: true; notaCredito: ComprobanteRow }
  | {
      ok: false;
      reason: NotaCreditoEmissionFailureReason;
      message: string;
      // Presente sólo en un rechazo/contingencia de ARCA.
      arca?: {
        resultado: string | null;
        errors: ArcaMessage[];
        observaciones: ArcaMessage[];
      };
    };

/**
 * Anula un comprobante emitiendo su Nota de crédito C espejo (`CbteTipo` 13,
 * #328). La Nota de crédito es total-only: replica el importe y las líneas
 * internas del comprobante que anula y lo referencia vía `CbtesAsoc`
 * (`associatedComprobanteId`). Se admiten cadenas ilimitadas de asociación: la
 * fila anulada nunca se borra ni se muta, así que su remanente cobrado vuelve a
 * ser facturable y puede re-facturarse y re-anularse indefinidamente.
 *
 * El `CbteNro` de la Nota de crédito se deriva de su propio
 * `FECompUltimoAutorizado + 1` (serie tipo 13). Sólo un CAE aprobado persiste la
 * Nota de crédito; un rechazo o contingencia de ARCA no persiste nada y deja el
 * comprobante original intacto y vigente.
 */
export async function annulComprobante(
  input: NotaCreditoEmissionInput,
  deps: FacturaCEmissionDeps,
): Promise<NotaCreditoEmissionOutcome> {
  const target = await loadComprobanteWithStatus(input.comprobanteId);

  if (!target) {
    return {
      ok: false,
      reason: "not-found",
      message: "No encontramos ese comprobante.",
    };
  }

  if (target.status === "anulada") {
    return {
      ok: false,
      reason: "already-annulled",
      message: "Ese comprobante ya fue anulado por una nota de crédito.",
    };
  }

  const last = await deps.client.getLastNotaCreditoCNumber(deps.ptoVta);
  const cbteFch = deps.cbteFch ?? toArcaDate(getBusinessDateOnly());

  const emission = await deps.client.emitNotaCreditoC({
    ptoVta: deps.ptoVta,
    cbteNro: last.nextCbteNro,
    cbteFch,
    importe: target.impTotal,
    condicionIvaReceptorId: deps.receptorIvaConditionId,
    emisorCuit: deps.issuerCuit,
    // La NC reenvía las fechas de servicio del comprobante que anula. La emisión
    // es siempre Concepto 2 (servicios, regla de negocio), y ARCA exige
    // `FchServ*`/`FchVtoPago` para Concepto 2: sin reenviarlas la NC salía sin
    // fechas → rechazo 10049. Los comprobantes reales siempre las tienen; sólo un
    // seed viejo de la base de test quedó sin fechas (Concepto 1, pre-fix).
    fchServDesde: target.fchServDesde ?? undefined,
    fchServHasta: target.fchServHasta ?? undefined,
    fchVtoPago: target.fchVtoPago ?? undefined,
    asociado: {
      cbteTipo: target.cbteTipo,
      ptoVta: target.ptoVta,
      cbteNro: target.cbteNro,
      cbteFch: target.cbteFch,
    },
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

  const notaCredito = await recordComprobante({
    choreographyId: target.choreographyId,
    eventId: target.eventId,
    cbteTipo: NOTA_CREDITO_C_CBTE_TIPO,
    ptoVta: deps.ptoVta,
    cbteNro: emission.cbteNro ?? last.nextCbteNro,
    cbteFch: emission.cbteFch ?? cbteFch,
    // Espejo total-only: mismo importe que el comprobante anulado.
    impTotal: target.impTotal,
    // La Nota de crédito espeja la porción del comprobante que anula (ADR-0011),
    // igual que el backfill de la migración 0005.
    porcion: target.porcion,
    issuerCuit: deps.issuerCuit,
    issuerIvaCondition: ISSUER_IVA_CONDITION,
    receptorDocTipo: DOC_TIPO_CONSUMIDOR_FINAL,
    receptorDocNro: String(DOC_NRO_CONSUMIDOR_FINAL),
    receptorIvaConditionId: deps.receptorIvaConditionId,
    cae: emission.cae,
    caeVto: emission.caeVto,
    associatedComprobanteId: target.id,
    // Réplica de las líneas internas del comprobante anulado, congeladas.
    lines: target.lines.map((line) => ({
      inscriptionId: line.inscriptionId,
      amount: line.amount,
    })),
  });

  return { ok: true, notaCredito };
}

// Carga el comprobante objetivo con su estado derivado y sus líneas internas. El
// estado se deriva sobre el conjunto de su coreografía ancla, que es
// autocontenido (la Nota de crédito espejo se ancla a la misma coreografía).
async function loadComprobanteWithStatus(
  comprobanteId: string,
): Promise<ComprobanteWithLines | null> {
  const [row] = await db
    .select({ choreographyId: comprobantes.choreographyId })
    .from(comprobantes)
    .where(eq(comprobantes.id, comprobanteId));

  if (!row) {
    return null;
  }

  const scope = await listChoreographyComprobantes(row.choreographyId);
  return scope.find((comprobante) => comprobante.id === comprobanteId) ?? null;
}
