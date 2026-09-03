import { eq } from "drizzle-orm";

import { db } from "@/db";
import { comprobantes } from "@/db/schema";

import {
  DOC_NRO_CONSUMIDOR_FINAL,
  DOC_TIPO_CONSUMIDOR_FINAL,
  NOTA_CREDITO_C_CBTE_TIPO,
} from "./arca/factura-c";
import type { ArcaAttemptedVoucher } from "./arca/contingency.server";
import {
  emitWithContingency,
  recheckWithContingency,
  type ArcaEmissionChoreography,
  type ArcaEmissionOutcome,
} from "./arca/emission.server";
import type { ArcaMessage } from "./arca/responses";
import {
  ISSUER_IVA_CONDITION,
  type FacturaCEmissionDeps,
} from "./emit-factura-c.server";
import {
  listChoreographyComprobantes,
  recordComprobante,
  type ComprobanteWithLines,
} from "./comprobantes.server";

type ComprobanteRow = Awaited<ReturnType<typeof recordComprobante>>;

// Annulment reuses the same emission inputs as the `Factura C`: the ARCA client
// (mockable), the sales point, the issuer CUIT and the recipient's VAT
// condition. The credit note runs on its own sequence series.
export type NotaCreditoEmissionInput = {
  comprobanteId: string;
};

export type NotaCreditoEmissionFailureReason =
  | "not-found"
  | "already-annulled"
  // ARCA responded and did not authorize.
  | "rejected"
  // ARCA did not respond and it was established that nothing was emitted:
  // retrying is safe (ADR-0012 decision 6).
  | "not-emitted"
  // ARCA did not respond and the follow-up lookup did not resolve what happened.
  | "unverified";

export type NotaCreditoEmissionOutcome =
  | {
      ok: true;
      notaCredito: ComprobanteRow;
      // The CAE was recovered by querying ARCA after an authorization with no
      // response, instead of coming from `FECAESolicitar` (#577).
      recovered: boolean;
    }
  | {
      ok: false;
      reason: NotaCreditoEmissionFailureReason;
      message: string;
      // Present only on a rejection from ARCA.
      arca?: {
        resultado: string | null;
        errors: ArcaMessage[];
        observaciones: ArcaMessage[];
      };
      // Present only on `unverified`: the credit note that could not be
      // resolved.
      attempt?: ArcaAttemptedVoucher;
    };

/**
 * Annuls a comprobante by emitting its mirror `Nota de crédito C` (`CbteTipo` 13,
 * #328). The credit note is total-only: it replicates the amount and the
 * internal lines of the comprobante it annuls and references it via `CbtesAsoc`
 * (`associatedComprobanteId`). Unlimited association chains are allowed: the
 * annulled row is never deleted or mutated, so its collected remainder becomes
 * billable again and can be re-billed and re-annulled indefinitely.
 *
 * The credit note's `CbteNro` is derived from its own
 * `FECompUltimoAutorizado + 1` (the type 13 series). Only an approved CAE
 * persists the credit note; a rejection from ARCA persists nothing and
 * leaves the original comprobante intact and in force.
 *
 * If ARCA does not respond, the failure is classified by phase exactly as
 * emission is (ADR-0012), against the type 13 series: if the sequence-number
 * lookup was cut off, nothing was annulled; if the authorization was cut off,
 * ARCA is queried for that exact credit note and, if it shows up and matches
 * what was sent, it is persisted with that CAE — the one exception to the
 * invariant that a contingency persists nothing. If the lookup fails, returns a
 * different one, or does not find it but the authorization timed out — and so is
 * still in flight — the result is `unverified` and nothing is persisted.
 */
export async function annulComprobante(
  input: NotaCreditoEmissionInput,
  deps: FacturaCEmissionDeps,
): Promise<NotaCreditoEmissionOutcome> {
  const resolved = await resolveNotaCreditoChoreography(input, deps);

  if (!resolved.ok) {
    return resolved;
  }

  return toNotaCreditoOutcome(await emitWithContingency(resolved.choreography));
}

/**
 * Re-verifies against ARCA an annulment left unresolved (#577), for the sequence
 * number the dialog carries over from the previous attempt. The amount the
 * queried comprobante is validated against comes from the comprobante being
 * annulled, not from the form (ADR-0012 decision 4).
 */
export async function recheckComprobanteAnnulment(
  input: NotaCreditoEmissionInput & { cbteNro: number },
  deps: FacturaCEmissionDeps,
): Promise<NotaCreditoEmissionOutcome> {
  const resolved = await resolveNotaCreditoChoreography(input, deps);

  if (!resolved.ok) {
    return resolved;
  }

  return toNotaCreditoOutcome(
    await recheckWithContingency(resolved.choreography, input.cbteNro),
  );
}

function toNotaCreditoOutcome(
  emission: ArcaEmissionOutcome<ComprobanteRow>,
): NotaCreditoEmissionOutcome {
  return emission.ok
    ? { ok: true, notaCredito: emission.voucher, recovered: emission.recovered }
    : emission;
}

/**
 * Builds the choreography of the mirror credit note: it validates the target
 * comprobante and freezes amount, dates and lines. Annulment and re-verification
 * share it, the latter needing the same inputs computed on the server.
 */
async function resolveNotaCreditoChoreography(
  input: NotaCreditoEmissionInput,
  deps: FacturaCEmissionDeps,
): Promise<
  | { ok: true; choreography: ArcaEmissionChoreography<ComprobanteRow> }
  | Extract<NotaCreditoEmissionOutcome, { ok: false }>
> {
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

  const choreography: ArcaEmissionChoreography<ComprobanteRow> = {
    client: deps.client,
    subject: "nota de crédito",
    ptoVta: deps.ptoVta,
    cbteTipo: NOTA_CREDITO_C_CBTE_TIPO,
    cbteFch: deps.cbteFch,
    // Total-only mirror: the same amount as the annulled comprobante.
    impTotal: target.impTotal,
    getLastNumber: () => deps.client.getLastNotaCreditoCNumber(deps.ptoVta),
    emit: (request) =>
      deps.client.emitNotaCreditoC({
        ptoVta: deps.ptoVta,
        cbteNro: request.cbteNro,
        cbteFch: request.cbteFch,
        importe: target.impTotal,
        condicionIvaReceptorId: deps.receptorIvaConditionId,
        emisorCuit: deps.issuerCuit,
        // The NC forwards the service dates of the comprobante it annuls.
        // Emission is always Concepto 2 (services, a business rule), and ARCA
        // requires `FchServ*`/`FchVtoPago` for Concepto 2: without forwarding them
        // the NC went out with no dates → rejection 10049. Real comprobantes
        // always have them; only an old seed in the test database was left
        // without dates (Concepto 1, pre-fix).
        fchServDesde: target.fchServDesde ?? undefined,
        fchServHasta: target.fchServHasta ?? undefined,
        fchVtoPago: target.fchVtoPago ?? undefined,
        asociado: {
          cbteTipo: target.cbteTipo,
          ptoVta: target.ptoVta,
          cbteNro: target.cbteNro,
          cbteFch: target.cbteFch,
        },
      }),
    persist: (authorized): Promise<ComprobanteRow> =>
      recordComprobante({
        choreographyId: target.choreographyId,
        eventId: target.eventId,
        cbteTipo: NOTA_CREDITO_C_CBTE_TIPO,
        ptoVta: deps.ptoVta,
        cbteNro: authorized.cbteNro,
        cbteFch: authorized.cbteFch,
        impTotal: target.impTotal,
        issuerCuit: deps.issuerCuit,
        issuerIvaCondition: ISSUER_IVA_CONDITION,
        receptorDocTipo: DOC_TIPO_CONSUMIDOR_FINAL,
        receptorDocNro: String(DOC_NRO_CONSUMIDOR_FINAL),
        receptorIvaConditionId: deps.receptorIvaConditionId,
        cae: authorized.cae,
        caeVto: authorized.caeVto,
        associatedComprobanteId: target.id,
        // Replica of the annulled comprobante's internal lines, frozen.
        lines: target.lines.map((line) => ({
          inscriptionId: line.inscriptionId,
          amount: line.amount,
        })),
      }),
  };

  return { ok: true, choreography };
}

// Loads the target comprobante with its derived state and its internal lines.
// The state is derived over the set of its anchor choreography, which is
// self-contained (the mirror credit note anchors to the same choreography).
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
