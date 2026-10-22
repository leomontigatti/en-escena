import {
  formatComprobanteArcaDate,
  formatComprobanteNumber,
} from "@/lib/comprobantes/format";
import {
  formatComprobanteKindLabel,
  formatComprobanteSeriesLabel,
} from "@/lib/comprobantes/kind";
import { formatAmount } from "@/lib/finances/formatters";

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
  { ok: true; value: T } | { ok: false; failure: ArcaCallFailure };

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

// What ARCA holds at a reserved number that is not what was submitted there.
export type ArcaTakenVoucher = {
  impTotal: number | null;
  cbteFch: string | null;
};

// Why nothing could be asserted. It does not reach the UI — which only
// distinguishes the three settled states (decision 6) — but it picks the text,
// which would otherwise lie about what happened.
export type ArcaUnverifiedReason =
  // The lookup failed, or returned a comprobante it could not settle.
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
  // ARCA holds a different comprobante at the number: ours was never
  // authorized there, and re-checking cannot change that (ADR-0014 §7).
  | { status: "number-taken"; taken: ArcaTakenVoucher }
  // Nothing can be asserted.
  | { status: "unverified"; reason: ArcaUnverifiedReason };

/**
 * Resolves the ambiguity left by a failure in the authorization phase by
 * querying ARCA for the exact comprobante that was attempted
 * (`FECompConsultar`, ADR-0012 decision 3).
 *
 * The number was reserved before it was submitted (ADR-0014 §7), so nobody in
 * this app submitted anything else at it: what identifies the attempt is the
 * reservation, not the amount and date. Those are compared all the same, as an
 * integrity assertion: a comprobante at our number that disagrees with what we
 * sent was emitted by somebody else, and it is `number-taken`, which no
 * re-check can clear.
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

  if (
    voucher.impTotal !== submitted.impTotal ||
    voucher.cbteFch !== submitted.cbteFch
  ) {
    return {
      status: "number-taken",
      taken: { impTotal: voucher.impTotal, cbteFch: voucher.cbteFch },
    };
  }

  if (!voucher.cae || !voucher.caeVto || !voucher.cbteFch) {
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
export type ArcaContingencySubject =
  "comprobante" | "nota de débito" | "nota de crédito";

const ARTICLE: Record<ArcaContingencySubject, string> = {
  comprobante: "el comprobante",
  "nota de débito": "la nota de débito",
  "nota de crédito": "la nota de crédito",
};

// The document as the operator's messages name it, with its article.
export function nameContingencySubject(
  subject: ArcaContingencySubject,
): string {
  return ARTICLE[subject];
}

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
 * ARCA holds another comprobante at the reserved number (#578): the evidence
 * against what was submitted, so whoever abandons the attempt decides on it.
 */
export function buildNumberTakenMessage(input: {
  attempt: ArcaAttemptedVoucher;
  submitted: { impTotal: number; cbteFch: string };
  taken: ArcaTakenVoucher;
}): string {
  const found = [
    input.taken.impTotal === null
      ? null
      : `por ${formatAmount(input.taken.impTotal)}`,
    input.taken.cbteFch === null
      ? null
      : `con fecha ${formatComprobanteArcaDate(input.taken.cbteFch)}`,
  ]
    .filter((part) => part !== null)
    .join(" ");

  return (
    `${formatAttemptedVoucher(input.attempt)} existe en ARCA${found ? ` ${found}` : ""}, ` +
    `y no coincide con lo que se envió (${formatAmount(input.submitted.impTotal)}, ` +
    `${formatComprobanteArcaDate(input.submitted.cbteFch)}). Verificá en el portal ` +
    `de ARCA antes de abandonar este intento: abandonarlo libera la serie ` +
    `${formatComprobanteSeriesLabel(input.attempt)} sin registrar nada.`
  );
}

/**
 * A live reservation met by another emission of its series (#578): the series
 * stays blocked until somebody resolves it, and the message carries what is
 * needed to find the attempt in ARCA's portal.
 */
export function buildSeriesBlockedMessage(input: {
  attempt: ArcaAttemptedVoucher;
  anchorLabel: string;
  impTotal: number;
}): string {
  return (
    `${formatAttemptedVoucher(input.attempt)} de ${input.anchorLabel}, por ` +
    `${formatAmount(input.impTotal)}, quedó sin confirmar con ARCA. No se puede ` +
    `emitir otro comprobante de la serie ${formatComprobanteSeriesLabel(input.attempt)} ` +
    `hasta resolverlo.`
  );
}

/**
 * How the comprobante left unresolved is named: the same as in the rest of the
 * app and in ARCA's own portal (`Factura C 0001-00001234`). It matters more
 * here than anywhere else, because that string is exactly what the operator has
 * to type in to do what the message is asking of them; `tipo 11, número 1234`
 * is no use for that. It lives in the builder rather than in the component, so
 * the invoice, the credit note and whatever type comes next inherit it.
 */
function formatAttemptedVoucher(attempt: ArcaAttemptedVoucher): string {
  return `${formatComprobanteKindLabel(attempt.cbteTipo)} ${formatComprobanteNumber(attempt)}`;
}
