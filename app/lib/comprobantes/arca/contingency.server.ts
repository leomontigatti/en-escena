import type { ArcaClient } from "./client.server";

/**
 * Contingencia por falta de respuesta de ARCA (ADR-0012): la llamada SOAP falló
 * por red, timeout o caída del servicio, así que no hay `Resultado` que
 * interpretar. Es un caso distinto del rechazo —donde ARCA sí respondió y dijo
 * que no— y el riesgo depende de la fase en la que se cortó.
 *
 * La fase NO se expone: es un insumo de la lógica de recuperación, no algo que
 * la UI use (ADR-0012 decisión 6).
 */
export type ArcaCallPhase =
  // Llamada de sólo lectura (`FECompUltimoAutorizado`, `FECompConsultar`): no se
  // pidió autorizar nada, así que con certeza esa llamada no emitió ningún
  // comprobante.
  | "lookup"
  // `FECAESolicitar`: se pidió el CAE y no sabemos si ARCA llegó a otorgarlo.
  // Reintentar a ciegas puede emitir un segundo comprobante por el mismo monto.
  | "authorization";

export type ArcaCallFailure = {
  phase: ArcaCallPhase;
  detail: string;
};

export type ArcaAttempt<T> =
  | { ok: true; value: T }
  | { ok: false; failure: ArcaCallFailure };

/**
 * Corre una llamada a ARCA clasificando su falla por fase en lugar de dejar que
 * la excepción del SOAP escale al error boundary genérico. Sólo captura fallas
 * de comunicación: un rechazo llega como respuesta normal y se interpreta aparte.
 */
export async function attemptArca<T>(
  phase: ArcaCallPhase,
  run: () => Promise<T>,
): Promise<ArcaAttempt<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (thrown) {
    const failure: ArcaCallFailure = {
      phase,
      detail: thrown instanceof Error ? thrown.message : String(thrown),
    };

    // Al operador se le dice qué quedó resuelto, no qué se rompió (ADR-0012
    // decisión 6). El detalle sólo sobrevive acá: antes de esto la excepción
    // llegaba al error boundary y al menos quedaba en el log del servidor.
    console.error("[arca:unreachable]", failure);

    return { ok: false, failure };
  }
}

// El comprobante que se intentó autorizar, tal como se lo consulta en ARCA.
export type ArcaAttemptedVoucher = {
  ptoVta: number;
  cbteTipo: number;
  cbteNro: number;
};

export type ArcaRecovery =
  // La consulta devolvió el comprobante y coincide con lo enviado: SÍ se
  // autorizó. Hay que persistirlo con este CAE.
  | { status: "recovered"; cae: string; caeVto: string; cbteFch: string }
  // ARCA no tiene ese comprobante: no se autorizó nada y reintentar es seguro.
  | { status: "not-emitted" }
  // La consulta falló, o el comprobante que volvió no es el nuestro: no se
  // puede afirmar nada.
  | { status: "unverified" };

/**
 * Resuelve la ambigüedad que deja una falla en la fase de autorización
 * consultando a ARCA por el comprobante exacto que se intentó emitir
 * (`FECompConsultar`, ADR-0012 decisión 3).
 *
 * El comprobante consultado cuenta como nuestro sólo si su importe total Y su
 * fecha coinciden con lo enviado (decisión 4): los correlativos no se reservan,
 * así que un comprobante con el número que intentamos no es necesariamente el
 * que quisimos emitir, y persistirlo a ciegas registraría un CAE ajeno que nada
 * río abajo podría detectar.
 */
export async function recoverAuthorization(
  client: ArcaClient,
  submitted: ArcaAttemptedVoucher & { impTotal: number; cbteFch: string },
): Promise<ArcaRecovery> {
  // `FECompConsultar` es de sólo lectura: falle como falle, esta llamada no
  // autoriza nada. La ambigüedad que se está resolviendo la dejó `FECAESolicitar`.
  const consult = await attemptArca("lookup", () =>
    client.getVoucherInfo({
      ptoVta: submitted.ptoVta,
      cbteTipo: submitted.cbteTipo,
      cbteNro: submitted.cbteNro,
    }),
  );

  if (!consult.ok) {
    return { status: "unverified" };
  }

  const voucher = consult.value;

  if (voucher === null) {
    return { status: "not-emitted" };
  }

  const matches =
    voucher.impTotal === submitted.impTotal &&
    voucher.cbteFch === submitted.cbteFch;

  if (!matches || !voucher.cae || !voucher.caeVto || !voucher.cbteFch) {
    return { status: "unverified" };
  }

  return {
    status: "recovered",
    cae: voucher.cae,
    caeVto: voucher.caeVto,
    cbteFch: voucher.cbteFch,
  };
}

// Cómo se nombra el documento en los mensajes al operador.
export type ArcaContingencySubject = "comprobante" | "nota de crédito";

const ARTICLE: Record<ArcaContingencySubject, string> = {
  comprobante: "el comprobante",
  "nota de crédito": "la nota de crédito",
};

export function buildNotEmittedMessage(
  subject: ArcaContingencySubject,
): string {
  return (
    `No pudimos comunicarnos con ARCA: no se emitió ${ARTICLE[subject]}. ` +
    "Reintentá en unos minutos."
  );
}

export function buildUnverifiedMessage(
  subject: ArcaContingencySubject,
  attempt: ArcaAttemptedVoucher,
): string {
  // El texto no concuerda en género con el sujeto a propósito: la consulta
  // posterior es el sujeto de la segunda oración, así que sirve igual para "el
  // comprobante" y para "la nota de crédito".
  return (
    `Se cortó la comunicación con ARCA mientras se autorizaba ` +
    `${ARTICLE[subject]} y la consulta posterior tampoco resolvió si llegó a ` +
    `emitirse (punto de venta ${attempt.ptoVta}, tipo ${attempt.cbteTipo}, ` +
    `número ${attempt.cbteNro}). Verificá ese comprobante en ARCA antes de ` +
    `reintentar, para no emitir dos veces.`
  );
}
