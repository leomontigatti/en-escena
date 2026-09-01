import { getBusinessDateOnly } from "@/lib/shared/business-time-zone";

import type { ArcaClient } from "./client.server";
import {
  attemptArca,
  buildNotEmittedMessage,
  buildUnverifiedMessage,
  recoverAuthorization,
  type ArcaAttemptedVoucher,
  type ArcaContingencySubject,
} from "./contingency.server";
import type {
  ArcaMessage,
  FacturaCEmissionResult,
  LastVoucherResult,
} from "./responses";

// The comprobante exactly as it was requested from ARCA: sequence number
// derived from the last authorized one, and the resolved date. Both emission
// and persistence receive it, because there is frozen data (the service dates)
// that depends on it.
export type ArcaEmissionRequest = {
  cbteNro: number;
  cbteFch: string;
};

// The comprobante once authorized. The happy path and the recovery-by-lookup
// path both arrive here with the same shape: the only thing that changes is
// where the CAE, the sequence number and the date come from.
export type ArcaAuthorizedVoucher = {
  cae: string;
  caeVto: string;
  cbteNro: number;
  cbteFch: string;
};

/**
 * The parts that change from one comprobante type to another: which sequence
 * series is queried, what gets authorized, how the document is named in the
 * messages shown to the operator, and how the authorized result is persisted.
 * Everything else — the order of the calls and the classification of failures —
 * is decided by `emitWithContingency`.
 */
export type ArcaEmissionChoreography<TVoucher> = {
  client: ArcaClient;
  subject: ArcaContingencySubject;
  ptoVta: number;
  cbteTipo: number;
  // Comprobante date in ARCA format. Defaults to the business date.
  cbteFch?: string;
  // Amount sent to ARCA: a comprobante recovered by lookup is validated against
  // this one (ADR-0012 decision 4).
  impTotal: number;
  getLastNumber: () => Promise<LastVoucherResult>;
  emit: (request: ArcaEmissionRequest) => Promise<FacturaCEmissionResult>;
  persist: (
    authorized: ArcaAuthorizedVoucher,
    request: ArcaEmissionRequest,
  ) => Promise<TVoucher>;
};

export type ArcaEmissionFailureReason =
  // ARCA responded and did not authorize.
  | "rejected"
  // ARCA did not respond and it was established that nothing was emitted:
  // retrying is safe (ADR-0012 decision 6).
  | "not-emitted"
  // ARCA did not respond and the follow-up lookup did not resolve what happened.
  | "unverified";

export type ArcaEmissionFailure = {
  ok: false;
  reason: ArcaEmissionFailureReason;
  message: string;
  // Present only on a rejection from ARCA.
  arca?: {
    resultado: string | null;
    errors: ArcaMessage[];
    observaciones: ArcaMessage[];
  };
  // Present only on `unverified`: the comprobante that could not be resolved.
  attempt?: ArcaAttemptedVoucher;
};

export type ArcaEmissionOutcome<TVoucher> =
  | {
      ok: true;
      voucher: TVoucher;
      // The CAE came from the lookup that followed an authorization with no
      // response, not from `FECAESolicitar`. The emission is just as valid, but
      // the operator asked for something we do not know reached ARCA, and it is
      // worth telling them (#577).
      recovered: boolean;
    }
  | ArcaEmissionFailure;

/**
 * Runs the emission choreography against WSFEv1: it looks up the sequence
 * number, authorizes, and persists only if ARCA granted a CAE.
 *
 * The `CbteNro` is derived from `FECompUltimoAutorizado + 1`. A rejection from
 * ARCA persists nothing.
 *
 * If ARCA does not respond, the failure is classified by phase (ADR-0012). If
 * the sequence-number lookup was cut off, nothing was authorized. If the
 * authorization was cut off, ARCA is queried for the exact comprobante that was
 * attempted: if it shows up and matches what was sent, it HAD been authorized
 * and is persisted with that CAE — the one exception to the invariant that a
 * contingency persists nothing, and it exists because the row corresponds to a
 * fiscal document that is demonstrably in ARCA. If it does not show up and the
 * authorization had failed at the transport level, nothing was emitted. If the
 * lookup fails, returns a different comprobante, or does not find it but the
 * authorization timed out — and so is still in flight, and could still be
 * authorized later — the result is `unverified` and nothing is persisted.
 */
export async function emitWithContingency<TVoucher>(
  choreography: ArcaEmissionChoreography<TVoucher>,
): Promise<ArcaEmissionOutcome<TVoucher>> {
  const lookup = await attemptArca("lookup", () =>
    choreography.getLastNumber(),
  );

  if (!lookup.ok) {
    return {
      ok: false,
      reason: "not-emitted",
      message: buildNotEmittedMessage(choreography.subject),
    };
  }

  const request: ArcaEmissionRequest = {
    cbteNro: lookup.value.nextCbteNro,
    cbteFch: choreography.cbteFch ?? toArcaDate(getBusinessDateOnly()),
  };

  const authorization = await attemptArca("authorization", () =>
    choreography.emit(request),
  );

  if (!authorization.ok) {
    const attempt: ArcaAttemptedVoucher = {
      ptoVta: choreography.ptoVta,
      cbteTipo: choreography.cbteTipo,
      cbteNro: request.cbteNro,
    };
    const recovery = await recoverAuthorization(
      choreography.client,
      { ...attempt, impTotal: choreography.impTotal, cbteFch: request.cbteFch },
      authorization.failure,
    );

    if (recovery.status === "not-emitted") {
      return {
        ok: false,
        reason: "not-emitted",
        message: buildNotEmittedMessage(choreography.subject),
      };
    }

    if (recovery.status === "unverified") {
      return {
        ok: false,
        reason: "unverified",
        message: buildUnverifiedMessage(
          choreography.subject,
          attempt,
          recovery.reason,
        ),
        attempt,
      };
    }

    const voucher = await choreography.persist(
      {
        cae: recovery.cae,
        caeVto: recovery.caeVto,
        cbteNro: attempt.cbteNro,
        cbteFch: recovery.cbteFch,
      },
      request,
    );

    return { ok: true, voucher, recovered: true };
  }

  const emission = authorization.value;

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

  const voucher = await choreography.persist(
    {
      cae: emission.cae,
      caeVto: emission.caeVto,
      cbteNro: emission.cbteNro ?? request.cbteNro,
      cbteFch: emission.cbteFch ?? request.cbteFch,
    },
    request,
  );

  return { ok: true, voucher, recovered: false };
}

/**
 * Queries ARCA again for a comprobante left `unverified`, without retrying the
 * authorization (#577). It is the only exit that **persists** a recovered
 * comprobante: if the operator checks by hand in the portal and the comprobante
 * is there, there is nothing they can do with that fact — they cannot retry and
 * the app has nowhere to record the CAE.
 *
 * Only the `cbteNro` travels from the client. The amount and the date — the two
 * fields that decide whether the comprobante occupying that sequence number is
 * ours (ADR-0012 decision 4) — are recomputed on the server from the
 * choreography. Sending them from the form would collapse decision 4 to a
 * single effective field: in this app the same amount repeats all the time.
 *
 * A tampered or stale `cbteNro` forces nothing: it makes the recomputed amount
 * fail to match, and the result stays `unverified`, which is the safe direction.
 *
 * Re-verification **can only prove the positive**. It runs as if the original
 * authorization had timed out, so a `null` never gets promoted to `not-emitted`
 * no matter how much time has passed: nobody has measured how long a request
 * can live on ARCA's side, and any threshold would be an invented number
 * (ADR-0012 decision 2). Erring towards `not-emitted` costs a second fiscal
 * comprobante that then has to be voided; erring towards `unverified` costs the
 * operator one click.
 */
export async function recheckWithContingency<TVoucher>(
  choreography: ArcaEmissionChoreography<TVoucher>,
  cbteNro: number,
): Promise<ArcaEmissionOutcome<TVoucher>> {
  const attempt: ArcaAttemptedVoucher = {
    ptoVta: choreography.ptoVta,
    cbteTipo: choreography.cbteTipo,
    cbteNro,
  };
  const cbteFch = choreography.cbteFch ?? toArcaDate(getBusinessDateOnly());

  const recovery = await recoverAuthorization(
    choreography.client,
    { ...attempt, impTotal: choreography.impTotal, cbteFch },
    // The original authorization is gone: it is treated as in flight so that a
    // `null` stays `unverified` instead of enabling the retry.
    {
      phase: "authorization",
      timedOut: true,
      detail: "re-verificación (#577)",
    },
  );

  if (recovery.status !== "recovered") {
    return {
      ok: false,
      reason: "unverified",
      message: buildUnverifiedMessage(
        choreography.subject,
        attempt,
        recovery.status === "unverified"
          ? recovery.reason
          : "authorization-in-flight",
      ),
      attempt,
    };
  }

  const voucher = await choreography.persist(
    {
      cae: recovery.cae,
      caeVto: recovery.caeVto,
      cbteNro: attempt.cbteNro,
      cbteFch: recovery.cbteFch,
    },
    { cbteNro: attempt.cbteNro, cbteFch },
  );

  return { ok: true, voucher, recovered: true };
}

// The reason for the rejection, in the order ARCA explains it: first the error
// that prevented it, then the observation, and as a last resort the raw
// `Resultado`.
function buildRejectionMessage(emission: FacturaCEmissionResult): string {
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
