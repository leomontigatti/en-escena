import type { ArcaEmissionFailureReason } from "./arca/emission.server";
import { formatArcaMessage, type ArcaMessage } from "./arca/responses";
import type { ComprobanteContingency } from "./contingency-alert";

// La forma mínima de una falla de emisión o de anulación. Las dos rutas la
// producen idéntica, así que el mapeo a la superficie de UI se escribe una vez.
// El `reason` admite cualquier string porque cada ruta suma los suyos —
// `not-found`, `nothing-to-bill`, `already-annulled`—, pero los tres que sí
// mapean se comparan contra `ArcaEmissionFailureReason`: renombrar uno allá
// rompe acá en lugar de degradar en silencio a error genérico.
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
const REJECTED: ArcaEmissionFailureReason = "rejected";
const NOT_EMITTED: ArcaEmissionFailureReason = "not-emitted";
const UNVERIFIED: ArcaEmissionFailureReason = "unverified";

export function toComprobanteContingency(
  failure: ContingencyFailure,
): ComprobanteContingency | null {
  if (failure.reason === REJECTED) {
    return {
      status: "rejected",
      message: failure.message,
      resultado: failure.arca?.resultado ?? null,
      errors: (failure.arca?.errors ?? []).map(formatArcaMessage),
      observaciones: (failure.arca?.observaciones ?? []).map(formatArcaMessage),
    };
  }

  if (failure.reason === NOT_EMITTED) {
    return { status: "not-emitted", message: failure.message };
  }

  if (failure.reason === UNVERIFIED && failure.attempt) {
    return {
      status: "unverified",
      message: failure.message,
      ...failure.attempt,
    };
  }

  return null;
}

// Lo que un action devuelve ante una falla: la contingencia si ARCA la produjo,
// y si no un error genérico. Las dos features la producen idéntica.
export type ContingencyActionData =
  | { status: "error"; message: string }
  | { status: "contingency"; contingency: ComprobanteContingency };

/**
 * Envuelve `toComprobanteContingency` en el `actionData` que consumen los dos
 * diálogos. Vive acá y no en cada feature para que la traducción falla → estado
 * de UI no pueda divergir entre la emisión y la anulación: el estado
 * `unverified` bloquea un submit destructivo, y la consecuencia de la deriva es
 * un segundo comprobante fiscal.
 */
export function toContingencyActionData(
  failure: ContingencyFailure,
): ContingencyActionData {
  const contingency = toComprobanteContingency(failure);

  return contingency
    ? { status: "contingency", contingency }
    : { status: "error", message: failure.message };
}
