import { formatArcaMessage, type ArcaMessage } from "./arca/responses";
import type { ComprobanteContingency } from "./contingency-alert";

// La forma mínima de una falla de emisión o de anulación. Las dos rutas la
// producen idéntica, así que el mapeo a la superficie de UI se escribe una vez.
export type ContingencyFailure = {
  reason: string;
  message: string;
  arca?: {
    resultado: string | null;
    errors: ArcaMessage[];
    observaciones: ArcaMessage[];
  };
  attempt?: { ptoVta: number; cbteTipo: number; cbteNro: number };
};

/**
 * Traduce una falla del server a lo que el operador ve (ADR-0012 decisión 6).
 * Devuelve `null` para las fallas que no son contingencias de ARCA —coreografía
 * inexistente, nada por facturar, comprobante ya anulado—: ésas son errores
 * genéricos y no habilitan ni bloquean ningún reintento.
 *
 * El `message` viaja tal cual lo escribió el server: es consciente del sujeto
 * ("el comprobante" vs. "la nota de crédito") y del motivo (si ARCA puede seguir
 * autorizando o no), y reescribirlo acá perdería las dos distinciones.
 */
export function toComprobanteContingency(
  failure: ContingencyFailure,
): ComprobanteContingency | null {
  if (failure.reason === "rejected") {
    return {
      status: "rejected",
      message: failure.message,
      resultado: failure.arca?.resultado ?? null,
      errors: (failure.arca?.errors ?? []).map(formatArcaMessage),
      observaciones: (failure.arca?.observaciones ?? []).map(formatArcaMessage),
    };
  }

  if (failure.reason === "not-emitted") {
    return { status: "not-emitted", message: failure.message };
  }

  if (failure.reason === "unverified" && failure.attempt) {
    return {
      status: "unverified",
      message: failure.message,
      ...failure.attempt,
    };
  }

  return null;
}
