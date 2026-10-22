import { formatComprobanteArcaDate } from "@/lib/comprobantes/format";
import { formatComprobanteSeriesLabel } from "@/lib/comprobantes/kind";

import type { ArcaClient } from "./client.server";
import {
  attemptArca,
  buildNotEmittedMessage,
  buildNumberTakenMessage,
  buildUnverifiedMessage,
  nameContingencySubject,
  recoverAuthorization,
  type ArcaAttemptedVoucher,
  type ArcaContingencySubject,
  type ArcaTakenVoucher,
} from "./contingency.server";
import {
  hasArcaCode,
  type ArcaMessage,
  type FacturaCEmissionResult,
} from "./responses";

// The comprobante exactly as it was requested from ARCA: the reserved sequence
// number and the date. Both emission and persistence receive it, because there
// is frozen data (the service dates) that depends on it.
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
 * What one emission needs besides the calls to ARCA: the series it numbers
 * on, what it submits, how the document is named to the operator, and the four
 * moves of its reservation. Everything else — the order of the calls and the
 * classification of failures — is decided by `emitWithContingency`.
 */
export type ArcaEmissionChoreography<TVoucher> = {
  client: ArcaClient;
  subject: ArcaContingencySubject;
  ptoVta: number;
  cbteTipo: number;
  // Comprobante date in ARCA format, already checked against its series.
  cbteFch: string;
  // Amount sent to ARCA: a comprobante found at the reserved number is checked
  // against it.
  impTotal: number;
  emit: (request: ArcaEmissionRequest) => Promise<FacturaCEmissionResult>;
  // Commits the reservation of `request.cbteNro` before ARCA is asked to
  // authorize it, or answers the failure that holds the series instead.
  reserve: (
    request: ArcaEmissionRequest,
  ) => Promise<ArcaEmissionFailure | null>;
} & ArcaReservationMoves<TVoucher>;

/**
 * What can happen to a reservation once ARCA has spoken, shared by the emission
 * and by the re-check of an attempt left live.
 */
export type ArcaReservationMoves<TVoucher> = {
  // Records the authorized comprobante and retires its reservation, at once.
  persist: (
    authorized: ArcaAuthorizedVoucher,
    request: ArcaEmissionRequest,
  ) => Promise<TVoucher>;
  // Retires the reservation: ARCA settled that the number was not consumed.
  release: () => Promise<void>;
  // Keeps it live, recording what ARCA holds at the number instead.
  markNumberTaken: (taken: ArcaTakenVoucher) => Promise<void>;
};

export type ArcaEmissionFailureReason =
  // ARCA responded and did not authorize.
  | "rejected"
  // ARCA did not respond and it was established that nothing was emitted:
  // retrying is safe (ADR-0012 decision 6).
  | "not-emitted"
  // Nobody knows yet whether ARCA authorized the reserved number: the
  // reservation stays live and blocks its series.
  | "unverified"
  // ARCA holds another comprobante at the reserved number. Re-checking cannot
  // change it; abandoning the reservation does (ADR-0014 §7).
  | "number-taken";

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
  // Present on `unverified` and `number-taken`: the reservation left live.
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
 * Runs the emission against WSFEv1 (ADR-0014 §7): it looks up the series'
 * last number, commits the reservation of the next one, authorizes it, and
 * persists only if ARCA granted a CAE. The reservation is committed before
 * `FECAESolicitar`, so a concurrent emission in the series sees it and stops,
 * and no database transaction is open while ARCA answers.
 *
 * Every answer settles the reservation. An authorization records the
 * comprobante and retires it. A rejection retires it, since a rejected
 * `FECAESolicitar` consumes no number (#686); so does an authorization that
 * failed in transport and that ARCA does not have.
 *
 * If ARCA does not respond, the failure is classified by phase (ADR-0012). If
 * the lookup was cut off, nothing was reserved or authorized. If the
 * authorization was cut off, ARCA is queried for the reserved number: what
 * shows up there matching what was sent is ours and is persisted with its CAE;
 * what shows up not matching is `number-taken`. When the query fails, or ARCA
 * does not have the number but the authorization timed out — and so may still
 * be in flight — the result is `unverified` and the reservation stays live.
 */
export async function emitWithContingency<TVoucher>(
  choreography: ArcaEmissionChoreography<TVoucher>,
): Promise<ArcaEmissionOutcome<TVoucher>> {
  const lookup = await attemptArca("lookup", () =>
    choreography.client.getLastComprobanteNumber(
      choreography.ptoVta,
      choreography.cbteTipo,
    ),
  );

  if (!lookup.ok) {
    return notEmitted(choreography.subject);
  }

  if (lookup.value.errors.length > 0) {
    return lastNumberRefused(choreography, lookup.value.errors);
  }

  const request: ArcaEmissionRequest = {
    cbteNro: lookup.value.nextCbteNro,
    cbteFch: choreography.cbteFch,
  };
  const attempt: ArcaAttemptedVoucher = {
    ptoVta: choreography.ptoVta,
    cbteTipo: choreography.cbteTipo,
    cbteNro: request.cbteNro,
  };

  const held = await choreography.reserve(request);

  if (held) {
    return held;
  }

  const authorization = await attemptArca("authorization", () =>
    choreography.emit(request),
  );

  if (!authorization.ok) {
    const recovery = await recoverAuthorization(
      choreography.client,
      { ...attempt, impTotal: choreography.impTotal, cbteFch: request.cbteFch },
      authorization.failure,
    );

    if (recovery.status === "not-emitted") {
      await choreography.release();

      return notEmitted(choreography.subject);
    }

    return await settleRecovery(choreography, {
      attempt,
      recovery,
      request,
      submitted: { impTotal: choreography.impTotal, cbteFch: request.cbteFch },
    });
  }

  const emission = authorization.value;

  if (!emission.approved || !emission.cae || !emission.caeVto) {
    await choreography.release();

    return {
      ok: false,
      reason: "rejected",
      message: await buildRejectionMessage(choreography, request, emission),
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
 * A reservation left live, as the re-check and the abandonment find it: the
 * number it holds and what was submitted at it, which is what a comprobante
 * ARCA holds there must match.
 */
export type ArcaReservedAttempt<TVoucher> = ArcaAttemptedVoucher & {
  client: ArcaClient;
  subject: ArcaContingencySubject;
  impTotal: number;
  cbteFch: string;
  state: "unverified" | "number-taken";
  // On `number-taken`: what ARCA holds at the number instead.
  taken: ArcaTakenVoucher | null;
} & ArcaReservationMoves<TVoucher>;

/**
 * Queries ARCA again for a reservation left live (#577), without retrying the
 * authorization. It persists what was submitted — the reservation's own
 * snapshot — rather than anything re-derived, since what ARCA authorized is a
 * fact whatever the anchor owes now (#578).
 *
 * Re-verification **can only prove the positive**. It runs as if the original
 * authorization had timed out, so a `null` never gets promoted to `not-emitted`
 * no matter how much time has passed: nobody has measured how long a request
 * can live on ARCA's side, and any threshold would be an invented number
 * (ADR-0012 decision 2). The way out of a `null` is the operator's: abandoning
 * the attempt, by `abandonReservedAttempt`.
 */
export async function recheckReservedAttempt<TVoucher>(
  reserved: ArcaReservedAttempt<TVoucher>,
): Promise<ArcaEmissionOutcome<TVoucher>> {
  const attempt = attemptOf(reserved);
  const recovery = await recoverAuthorization(
    reserved.client,
    { ...attempt, impTotal: reserved.impTotal, cbteFch: reserved.cbteFch },
    // The original authorization is gone: it is treated as in flight so that a
    // `null` stays `unverified` instead of releasing the number.
    {
      phase: "authorization",
      timedOut: true,
      detail: "re-verificación (#577)",
    },
  );

  return await settleRecovery(reserved, {
    attempt,
    recovery:
      recovery.status === "not-emitted"
        ? { status: "unverified", reason: "authorization-in-flight" }
        : recovery,
    request: { cbteNro: attempt.cbteNro, cbteFch: reserved.cbteFch },
    submitted: { impTotal: reserved.impTotal, cbteFch: reserved.cbteFch },
  });
}

export type ArcaAbandonOutcome<TVoucher> =
  { ok: true; released: true } | ArcaEmissionOutcome<TVoucher>;

/**
 * The operator gives up on a reservation, which frees its series. On
 * `number-taken` the number belongs to somebody else, so nothing of ours can
 * appear there and the reservation goes. On `unverified` the operator declares
 * they checked ARCA's portal: it goes only while ARCA has not reached the
 * number, and once ARCA has, the number is resolved by asking ARCA what it
 * holds there rather than by being let go — it is either ours or someone
 * else's, and the operator's word is not needed for either.
 */
export async function abandonReservedAttempt<TVoucher>(
  reserved: ArcaReservedAttempt<TVoucher>,
): Promise<ArcaAbandonOutcome<TVoucher>> {
  const attempt = attemptOf(reserved);

  if (reserved.state === "number-taken") {
    return await releaseAbandoned(reserved);
  }

  const lookup = await attemptArca("lookup", () =>
    reserved.client.getLastComprobanteNumber(
      reserved.ptoVta,
      reserved.cbteTipo,
    ),
  );

  if (!lookup.ok) {
    return {
      ok: false,
      reason: "unverified",
      message: buildUnverifiedMessage(
        reserved.subject,
        attempt,
        "consult-inconclusive",
      ),
      attempt,
    };
  }

  // An answer with errors carries no number: it proves nothing about how far
  // ARCA has got, so nothing is released on it.
  if (lookup.value.errors.length > 0) {
    return {
      ok: false,
      reason: "unverified",
      message: buildUnverifiedMessage(
        reserved.subject,
        attempt,
        "consult-inconclusive",
      ),
      attempt,
    };
  }

  if (lookup.value.lastCbteNro < attempt.cbteNro) {
    return await releaseAbandoned(reserved);
  }

  return await recheckReservedAttempt(reserved);
}

// An abandoned attempt leaves no row behind, so the log is the only trace of
// what was given up and on what evidence: what was submitted against what ARCA
// holds at the number (#578).
async function releaseAbandoned<TVoucher>(
  reserved: ArcaReservedAttempt<TVoucher>,
): Promise<{ ok: true; released: true }> {
  console.warn("[arca:attempt-abandoned]", {
    ...attemptOf(reserved),
    state: reserved.state,
    submitted: { impTotal: reserved.impTotal, cbteFch: reserved.cbteFch },
    taken: reserved.taken,
  });
  await reserved.release();

  return { ok: true, released: true };
}

type SettledRecovery = Exclude<
  Awaited<ReturnType<typeof recoverAuthorization>>,
  { status: "not-emitted" }
>;

// What a query of the reserved number settles, the same for an emission and a
// re-check: ours is recorded, someone else's marks the reservation, and
// anything else leaves it live and unverified.
async function settleRecovery<TVoucher>(
  moves: ArcaReservationMoves<TVoucher> & { subject: ArcaContingencySubject },
  input: {
    attempt: ArcaAttemptedVoucher;
    recovery: SettledRecovery;
    request: ArcaEmissionRequest;
    submitted: { impTotal: number; cbteFch: string };
  },
): Promise<ArcaEmissionOutcome<TVoucher>> {
  const { attempt, recovery } = input;

  if (recovery.status === "unverified") {
    return {
      ok: false,
      reason: "unverified",
      message: buildUnverifiedMessage(moves.subject, attempt, recovery.reason),
      attempt,
    };
  }

  if (recovery.status === "number-taken") {
    // The one case whose evidence would otherwise be lost (#578): the log
    // keeps what ARCA holds against what was reserved.
    console.error("[arca:number-taken]", {
      ...attempt,
      submitted: input.submitted,
      taken: recovery.taken,
    });
    await moves.markNumberTaken(recovery.taken);

    return {
      ok: false,
      reason: "number-taken",
      message: buildNumberTakenMessage({
        attempt,
        submitted: input.submitted,
        taken: recovery.taken,
      }),
      attempt,
    };
  }

  const voucher = await moves.persist(
    {
      cae: recovery.cae,
      caeVto: recovery.caeVto,
      cbteNro: attempt.cbteNro,
      cbteFch: recovery.cbteFch,
    },
    input.request,
  );

  return { ok: true, voucher, recovered: true };
}

function attemptOf(reserved: ArcaAttemptedVoucher): ArcaAttemptedVoucher {
  return {
    ptoVta: reserved.ptoVta,
    cbteTipo: reserved.cbteTipo,
    cbteNro: reserved.cbteNro,
  };
}

// ARCA answered the last-number lookup with errors instead of a number: it
// responded and said no, so it reads as a rejection with ARCA's own reason,
// and nothing was reserved or authorized.
function lastNumberRefused(
  choreography: Pick<
    ArcaEmissionChoreography<unknown>,
    "subject" | "ptoVta" | "cbteTipo"
  >,
  errors: ArcaMessage[],
): ArcaEmissionFailure {
  return {
    ok: false,
    reason: "rejected",
    message:
      `ARCA no informó el último número de la serie ` +
      `${formatComprobanteSeriesLabel(choreography)}, así que no se emitió ` +
      `${nameContingencySubject(choreography.subject)} (${errors[0]?.msg ?? "sin detalle"}).`,
    arca: { resultado: null, errors, observaciones: [] },
  };
}

function notEmitted(subject: ArcaContingencySubject): ArcaEmissionFailure {
  return {
    ok: false,
    reason: "not-emitted",
    message: buildNotEmittedMessage(subject),
  };
}

/**
 * The reason for a rejection. Two codes get their own words because the
 * operator's remedy depends on them, and both are looked for in `Errors` and
 * `Observaciones` alike: ARCA returns 10197 in `Observaciones` with `Errors`
 * absent (#686).
 *
 * - 10016 covers two axes under one code (#612): the number must be the
 *   series' next, and the date no earlier than the series' last. Which one
 *   failed is settled by asking ARCA for the series' last number again: if ours
 *   is still the next, it was the date.
 * - 10197 is a note sent without the comprobante it adjusts.
 *
 * Anything else reads as ARCA explains it: first the error, then the
 * observation, and as a last resort the raw `Resultado`.
 */
async function buildRejectionMessage(
  choreography: Pick<
    ArcaEmissionChoreography<unknown>,
    "client" | "subject" | "ptoVta" | "cbteTipo"
  >,
  request: ArcaEmissionRequest,
  emission: FacturaCEmissionResult,
): Promise<string> {
  const subject = nameContingencySubject(choreography.subject);
  const series = formatComprobanteSeriesLabel(choreography);

  if (hasArcaCode(emission, 10016)) {
    const lookup = await attemptArca("lookup", () =>
      choreography.client.getLastComprobanteNumber(
        choreography.ptoVta,
        choreography.cbteTipo,
      ),
    );

    if (!lookup.ok) {
      return (
        `ARCA no autorizó ${subject}: el número o la fecha no son los que siguen ` +
        `en la serie ${series} (código 10016), y no pudimos consultar cuál de los dos. ` +
        `Revisá la fecha y volvé a emitir.`
      );
    }

    return lookup.value.nextCbteNro === request.cbteNro
      ? `ARCA no aceptó la fecha ${formatComprobanteArcaDate(request.cbteFch)} para ` +
          `${subject}: en la serie ${series} la fecha no puede ser anterior a la del ` +
          `último comprobante autorizado ni de más de 10 días atrás (código 10016). ` +
          `Elegí otra fecha y volvé a emitir.`
      : `ARCA no aceptó el número ${request.cbteNro} para ${subject}: en la serie ` +
          `${series} se autorizó otro comprobante mientras emitíamos (código 10016). ` +
          `Volvé a emitir para tomar el número siguiente.`;
  }

  if (hasArcaCode(emission, 10197)) {
    return (
      `ARCA no autorizó ${subject}: una nota tiene que indicar el comprobante ` +
      `que ajusta (código 10197, ${detailOf(emission)}).`
    );
  }

  return `ARCA no autorizó el comprobante (${detailOf(emission)}).`;
}

function detailOf(emission: FacturaCEmissionResult): string {
  return (
    emission.errors[0]?.msg ??
    emission.observaciones[0]?.msg ??
    emission.resultado ??
    "sin detalle"
  );
}

// Business date `AAAA-MM-DD` → ARCA format `AAAAMMDD`.
export function toArcaDate(dateOnly: string): string {
  return dateOnly.replace(/-/g, "");
}
