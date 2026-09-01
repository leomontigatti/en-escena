import {
  formatComprobanteNumber,
  formatComprobanteTipoLabel,
} from "@/lib/comprobantes/format";

import { ArcaTimeoutError, type ArcaClient } from "./client.server";

/**
 * Contingency from a missing response from ARCA (ADR-0012): the SOAP call
 * failed on the network, on a timeout or on a service outage, so there is no
 * `Resultado` to interpret. It is a different case from a rejection — where
 * ARCA did respond and said no — and the risk depends on the phase it was cut
 * off in.
 *
 * The phase is NOT exposed: it is an input to the recovery logic, not something
 * the UI uses (ADR-0012 decision 6).
 */
export type ArcaCallPhase =
  // Read-only call (`FECompUltimoAutorizado`, `FECompConsultar`): nothing was
  // asked to be authorized, so that call certainly did not emit any
  // comprobante.
  | "lookup"
  // `FECAESolicitar`: the CAE was requested and we do not know whether ARCA got
  // as far as granting it. Retrying blindly may emit a second comprobante for
  // the same amount.
  | "authorization";

export type ArcaCallFailure = {
  phase: ArcaCallPhase;
  // Whether OUR timeout elapsed instead of the transport failing. A timeout
  // leaves the request in flight, so the call may complete on ARCA's side after
  // we stop waiting; a transport error does not.
  timedOut: boolean;
  detail: string;
};

export type ArcaAttempt<T> =
  | { ok: true; value: T }
  | { ok: false; failure: ArcaCallFailure };

/**
 * Runs a call to ARCA, classifying its failure by phase instead of letting the
 * SOAP exception escalate to the generic error boundary. It only catches
 * communication failures: a rejection arrives as a normal response and is
 * interpreted separately.
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
      timedOut: thrown instanceof ArcaTimeoutError,
      detail: thrown instanceof Error ? thrown.message : String(thrown),
    };

    // The operator is told what was settled, not what broke (ADR-0012
    // decision 6). The detail only survives here: before this the exception
    // reached the error boundary and at least stayed in the server log.
    console.error("[arca:unreachable]", failure);

    return { ok: false, failure };
  }
}

// The comprobante that was attempted, as it is queried in ARCA.
export type ArcaAttemptedVoucher = {
  ptoVta: number;
  cbteTipo: number;
  cbteNro: number;
};

// Why nothing could be asserted. It does not reach the UI — which only
// distinguishes the three settled states (decision 6) — but it picks the text,
// which would otherwise lie about what happened.
export type ArcaUnverifiedReason =
  // The lookup failed, or returned a comprobante that is not ours.
  | "consult-inconclusive"
  // The lookup answered that ARCA does not have it, but the authorization was
  // cut off by a timeout and is still in flight: the "I don't have it" may be
  // just "not yet".
  | "authorization-in-flight";

export type ArcaRecovery =
  // The lookup returned the comprobante and it matches what was sent: it WAS
  // authorized. It has to be persisted with this CAE.
  | { status: "recovered"; cae: string; caeVto: string; cbteFch: string }
  // ARCA does not have that comprobante and the request cannot still be in
  // progress: nothing was authorized and retrying is safe.
  | { status: "not-emitted" }
  // Nothing can be asserted.
  | { status: "unverified"; reason: ArcaUnverifiedReason };

/**
 * Resolves the ambiguity left by a failure in the authorization phase by
 * querying ARCA for the exact comprobante that was attempted
 * (`FECompConsultar`, ADR-0012 decision 3).
 *
 * The comprobante that comes back counts as ours only if its total amount AND
 * its date match what was sent (decision 4): sequence numbers are not reserved,
 * so a comprobante carrying the number we attempted is not necessarily the one
 * we meant to emit, and persisting it blindly would record somebody else's CAE,
 * which nothing downstream could detect.
 *
 * ARCA not having the comprobante only proves it was not emitted if the
 * authorization request finished. If it was cut off by a timeout it is still in
 * flight, and the lookup — issued milliseconds later — may be looking at a CAE
 * that ARCA is about to grant: reading that `null` as "safe to retry" is the
 * double emission this whole thing exists to prevent.
 */
export async function recoverAuthorization(
  client: ArcaClient,
  submitted: ArcaAttemptedVoucher & { impTotal: number; cbteFch: string },
  authorizationFailure: ArcaCallFailure,
): Promise<ArcaRecovery> {
  // `FECompConsultar` is read-only: however it fails, this call authorizes
  // nothing. The ambiguity being resolved was left by `FECAESolicitar`.
  const consult = await attemptArca("lookup", () =>
    client.getVoucherInfo({
      ptoVta: submitted.ptoVta,
      cbteTipo: submitted.cbteTipo,
      cbteNro: submitted.cbteNro,
    }),
  );

  if (!consult.ok) {
    return { status: "unverified", reason: "consult-inconclusive" };
  }

  const voucher = consult.value;

  if (voucher === null) {
    return authorizationFailure.timedOut
      ? { status: "unverified", reason: "authorization-in-flight" }
      : { status: "not-emitted" };
  }

  const matches =
    voucher.impTotal === submitted.impTotal &&
    voucher.cbteFch === submitted.cbteFch;

  if (!matches || !voucher.cae || !voucher.caeVto || !voucher.cbteFch) {
    return { status: "unverified", reason: "consult-inconclusive" };
  }

  return {
    status: "recovered",
    cae: voucher.cae,
    caeVto: voucher.caeVto,
    cbteFch: voucher.cbteFch,
  };
}

// How the document is named in the messages shown to the operator.
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
  reason: ArcaUnverifiedReason,
): string {
  // The text deliberately does not agree in gender with the subject: the
  // follow-up lookup is the subject of the second sentence, so it works just as
  // well for "el comprobante" and for "la nota de crédito".
  const what =
    reason === "authorization-in-flight"
      ? `ARCA tardó más de lo que esperamos autorizando ${ARTICLE[subject]} y ` +
        `todavía no lo tiene registrado, pero la autorización puede seguir en curso`
      : `Se cortó la comunicación con ARCA mientras se autorizaba ` +
        `${ARTICLE[subject]} y la consulta posterior tampoco resolvió si llegó a ` +
        `emitirse`;

  return (
    `${what} (${formatAttemptedVoucher(attempt)}). Verificá ese comprobante ` +
    `en ARCA antes de reintentar, para no emitir dos veces.`
  );
}

/**
 * How the comprobante left unresolved is named: the same as in the rest of the
 * app and in ARCA's own portal (`Factura C 0001-00001234`). It matters more
 * here than anywhere else, because that string is exactly what the operator has
 * to type in to do what the message is asking of them; `tipo 11, número 1234`
 * is no use for that. It lives in the builder rather than in the component, so
 * the factura, the nota de crédito and whatever type comes next inherit it.
 */
function formatAttemptedVoucher(attempt: ArcaAttemptedVoucher): string {
  return `${formatComprobanteTipoLabel(attempt.cbteTipo)} ${formatComprobanteNumber(attempt)}`;
}
