import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { comprobantes } from "@/db/schema";

import {
  abandonReservedAttempt,
  recheckReservedAttempt,
  type ArcaReservedAttempt,
} from "./arca/emission.server";
import { readComprobanteAnchor } from "./anchor";
import {
  toOutcome,
  underAnchorLock,
  type ComprobanteEmissionDeps,
  type ComprobanteEmissionOutcome,
} from "./emit-comprobante.server";
import {
  findReservation,
  markReservationNumberTaken,
  recordReservedComprobante,
  releaseReservation,
  subjectOf,
  type ComprobanteReservation,
} from "./reservation.server";

/*
 * The two ways out of a reservation left live (ADR-0014 §7, #578): asking ARCA
 * again what it holds at the number, and abandoning the attempt. Both reach the
 * reservation by its series and number alone, whatever detail the operator is
 * on, and act on the anchor it names.
 */

type ComprobanteRow = Awaited<ReturnType<typeof recordReservedComprobante>>;

// A reservation left live, as the operator's form names it: its series and
// number. The sales point is the configured one.
export type ReservedAttemptInput = { cbteTipo: number; cbteNro: number };

/**
 * Re-verifies against ARCA a reservation left live (#577), for the series and
 * number the dialog carries over from the attempt or from the block. It does
 * not re-plan: what ARCA authorized at that number is recorded as it was
 * submitted, from the reservation, on the anchor the reservation names — which
 * need not be the detail the operator is on (#578).
 */
export async function recheckComprobanteReservation(
  input: ReservedAttemptInput,
  deps: ComprobanteEmissionDeps,
): Promise<ComprobanteEmissionOutcome> {
  return await onLiveReservation(input, deps, async (reserved) =>
    toOutcome(await recheckReservedAttempt(reserved)),
  );
}

/**
 * Gives up a reservation left live, which frees its series: a `number-taken`
 * one at once, an `unverified` one only while ARCA has not reached its number
 * (`abandonReservedAttempt`). `released` says the series is free again.
 */
export async function abandonComprobanteReservation(
  input: ReservedAttemptInput,
  deps: ComprobanteEmissionDeps,
): Promise<ComprobanteEmissionOutcome | { ok: true; released: true }> {
  return await onLiveReservation(input, deps, async (reserved) => {
    const outcome = await abandonReservedAttempt(reserved);

    return "released" in outcome ? outcome : toOutcome(outcome);
  });
}

/**
 * Runs `act` on the live reservation at the attempt's number, under the lock
 * of the anchor it names, so it never races an emission of that anchor still in
 * flight: while one is, the answer is `busy`. A reservation already gone was
 * resolved by somebody else: the comprobante is there, or nothing was emitted.
 */
async function onLiveReservation<T>(
  input: ReservedAttemptInput,
  deps: ComprobanteEmissionDeps,
  act: (reserved: ArcaReservedAttempt<ComprobanteRow>) => Promise<T>,
): Promise<T | ComprobanteEmissionOutcome> {
  const attempt = { ptoVta: deps.ptoVta, ...input };
  const found = await findReservation(attempt);

  if (!found) {
    return await alreadyResolved(attempt);
  }

  return await underAnchorLock(readComprobanteAnchor(found), async () => {
    // Read again under the lock, and only the same row: the one found may have
    // been settled meanwhile and the number reserved again by another anchor,
    // whose lock this is not.
    const reservation = await findReservation(attempt);

    return reservation?.id === found.id
      ? await act(reservedAttempt(reservation, deps))
      : await alreadyResolved(attempt);
  });
}

async function alreadyResolved(attempt: {
  ptoVta: number;
  cbteTipo: number;
  cbteNro: number;
}): Promise<ComprobanteEmissionOutcome> {
  const [comprobante] = await db
    .select()
    .from(comprobantes)
    .where(
      and(
        eq(comprobantes.ptoVta, attempt.ptoVta),
        eq(comprobantes.cbteTipo, attempt.cbteTipo),
        eq(comprobantes.cbteNro, attempt.cbteNro),
      ),
    );

  return comprobante
    ? { ok: true, comprobante, recovered: true }
    : {
        ok: false,
        reason: "not-emitted",
        message:
          "Ese intento ya se resolvió y no quedó ningún comprobante emitido: podés volver a emitir.",
      };
}

function reservedAttempt(
  reservation: ComprobanteReservation,
  deps: ComprobanteEmissionDeps,
): ArcaReservedAttempt<ComprobanteRow> {
  return {
    client: deps.client,
    subject: subjectOf(reservation.cbteTipo),
    ptoVta: reservation.ptoVta,
    cbteTipo: reservation.cbteTipo,
    cbteNro: reservation.cbteNro,
    impTotal: reservation.impTotal,
    cbteFch: reservation.cbteFch,
    state: reservation.state,
    taken:
      reservation.state === "number-taken"
        ? {
            impTotal: reservation.takenImpTotal,
            cbteFch: reservation.takenCbteFch,
          }
        : null,
    persist: (authorized) => recordReservedComprobante(reservation, authorized),
    release: () => releaseReservation(reservation),
    markNumberTaken: (taken) => markReservationNumberTaken(reservation, taken),
  };
}
