import { and, eq, max, or, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  comprobanteReservations,
  comprobantes,
  seminars,
} from "@/db/schema";

import {
  comprobanteAnchorColumns,
  readComprobanteAnchor,
  type ComprobanteAnchor,
} from "./anchor";
import type { ComprobanteExecutor } from "./anchor-lock.server";
import { formatComprobanteAnchorLabel } from "./anchor-reading";
import {
  buildNumberTakenMessage,
  buildSeriesBlockedMessage,
  type ArcaContingencySubject,
  type ArcaTakenVoucher,
} from "./arca/contingency.server";
import type {
  ArcaAuthorizedVoucher,
  ArcaEmissionFailure,
} from "./arca/emission.server";
import {
  recordComprobante,
  type RecordComprobanteInput,
} from "./comprobantes.server";
import { readComprobanteKind, type KnownComprobanteKind } from "./kind";

/*
 * The correlative reservation (ADR-0014 §7): the lease an emission takes on
 * its series' next number before `FECAESolicitar`. Every read and write of the
 * table is here, so the rule that a live reservation is one that exists has a
 * single owner.
 */

export type ComprobanteReservation =
  typeof comprobanteReservations.$inferSelect;

// The series a reservation holds: a kind of document at one sales point.
type ComprobanteSeries = { ptoVta: number; cbteTipo: number };

// What the emission submits, which is what the reservation keeps: the
// comprobante's snapshot without the CAE ARCA has not granted yet, with the
// academy the anchor resolves to.
export type ReservedComprobanteInput = Omit<
  RecordComprobanteInput,
  "cae" | "caeVto"
> & { academyId: string };

/**
 * Commits the reservation of `input.cbteNro`, in a statement of its own so it
 * is visible to every other emission before ARCA is called. Returns `null` when
 * the series already holds one: the unique index on the series is the block
 * and the guard against two emissions taking one number in the same stroke.
 */
export async function reserveCorrelative(
  input: ReservedComprobanteInput,
): Promise<ComprobanteReservation | null> {
  const [reservation] = await db
    .insert(comprobanteReservations)
    .values({
      ...comprobanteAnchorColumns(input.anchor),
      academyId: input.academyId,
      eventId: input.eventId,
      ptoVta: input.ptoVta,
      cbteTipo: input.cbteTipo,
      cbteNro: input.cbteNro,
      impTotal: input.impTotal,
      cbteFch: input.cbteFch,
      payload: {
        fchServDesde: input.fchServDesde ?? null,
        fchServHasta: input.fchServHasta ?? null,
        fchVtoPago: input.fchVtoPago ?? null,
        issuerCuit: input.issuerCuit,
        issuerIvaCondition: input.issuerIvaCondition,
        receptorDocTipo: input.receptorDocTipo,
        receptorDocNro: input.receptorDocNro,
        receptorIvaConditionId: input.receptorIvaConditionId,
        associatedComprobanteId: input.associatedComprobanteId ?? null,
        lines: input.lines,
      },
    })
    .onConflictDoNothing({
      target: [
        comprobanteReservations.ptoVta,
        comprobanteReservations.cbteTipo,
      ],
    })
    .returning();

  return reservation ?? null;
}

/**
 * The live reservation an emission of `anchor` in `series` would run into: the
 * series' own, which blocks every emission there, or one of the anchor's in
 * any series, whose document the anchor's plan cannot see yet and which may
 * already be at ARCA.
 */
export async function findBlockingReservation(
  input: ComprobanteSeries & { anchor: ComprobanteAnchor },
): Promise<ComprobanteReservation | null> {
  const [reservation] = await db
    .select()
    .from(comprobanteReservations)
    .where(
      or(
        and(
          eq(comprobanteReservations.ptoVta, input.ptoVta),
          eq(comprobanteReservations.cbteTipo, input.cbteTipo),
        ),
        reservationAnchorFilter(input.anchor),
      ),
    )
    .orderBy(comprobanteReservations.createdAt)
    .limit(1);

  return reservation ?? null;
}

/**
 * The oldest live reservation at the sales point, in any series: what a bulk
 * emission meets before it starts (#617). With no sales point configured every
 * point counts, which is only ever stricter.
 */
export async function findLiveReservation(
  ptoVta: number | null,
): Promise<ComprobanteReservation | null> {
  const [reservation] = await db
    .select()
    .from(comprobanteReservations)
    .where(
      ptoVta === null ? undefined : eq(comprobanteReservations.ptoVta, ptoVta),
    )
    .orderBy(comprobanteReservations.createdAt)
    .limit(1);

  return reservation ?? null;
}

export async function findReservation(
  attempt: ComprobanteSeries & { cbteNro: number },
): Promise<ComprobanteReservation | null> {
  const [reservation] = await db
    .select()
    .from(comprobanteReservations)
    .where(
      and(
        eq(comprobanteReservations.ptoVta, attempt.ptoVta),
        eq(comprobanteReservations.cbteTipo, attempt.cbteTipo),
        eq(comprobanteReservations.cbteNro, attempt.cbteNro),
      ),
    );

  return reservation ?? null;
}

// ARCA settled that the number was not consumed, or the operator gave it up:
// the lease ends and the series is free.
export async function releaseReservation(
  reservation: Pick<ComprobanteReservation, "id">,
): Promise<void> {
  await db
    .delete(comprobanteReservations)
    .where(eq(comprobanteReservations.id, reservation.id));
}

export async function markReservationNumberTaken(
  reservation: Pick<ComprobanteReservation, "id">,
  taken: ArcaTakenVoucher,
): Promise<void> {
  await db
    .update(comprobanteReservations)
    .set({
      state: "number-taken",
      takenImpTotal: taken.impTotal,
      takenCbteFch: taken.cbteFch,
    })
    .where(eq(comprobanteReservations.id, reservation.id));
}

/**
 * Records the comprobante ARCA authorized at a reserved number and retires the
 * reservation, in one transaction: the series is never free while the
 * comprobante is not there, nor blocked once it is. What is recorded is the
 * reservation's snapshot, what was submitted, whatever the anchor owes now
 * (#578).
 */
export async function recordReservedComprobante(
  reservation: ComprobanteReservation,
  authorized: ArcaAuthorizedVoucher,
) {
  return await db.transaction(async (tx) => {
    const comprobante = await recordComprobante(
      {
        anchor: readComprobanteAnchor(reservation),
        eventId: reservation.eventId,
        cbteTipo: reservation.cbteTipo,
        ptoVta: reservation.ptoVta,
        cbteNro: authorized.cbteNro,
        cbteFch: authorized.cbteFch,
        impTotal: reservation.impTotal,
        ...reservation.payload,
        cae: authorized.cae,
        caeVto: authorized.caeVto,
      },
      tx,
    );

    await tx
      .delete(comprobanteReservations)
      .where(eq(comprobanteReservations.id, reservation.id));

    return comprobante;
  });
}

/**
 * How the attempt's anchor reads in the message that blocks its series: the
 * operator who meets it may be on another unit's detail.
 */
async function readReservationAnchorLabel(
  reservation: ComprobanteReservation,
): Promise<string> {
  if (reservation.choreographyId !== null) {
    const [choreography] = await db
      .select({ name: choreographies.name })
      .from(choreographies)
      .where(eq(choreographies.id, reservation.choreographyId));

    return `la coreografía «${choreography?.name ?? reservation.choreographyId}»`;
  }

  const [seminar] = await db
    .select({
      instructorName: seminars.instructorName,
      scheduledDate: seminars.scheduledDate,
    })
    .from(seminars)
    .where(eq(seminars.id, reservation.seminarId as string));

  return seminar
    ? `«${formatComprobanteAnchorLabel({
        kind: "seminar",
        seminarId: reservation.seminarId as string,
        ...seminar,
      })}»`
    : `el seminario ${reservation.seminarId}`;
}

/**
 * The inscriptions, among `inscriptionIds`, that a live reservation names in
 * its lines. They count as evidence the way a comprobante line does: the
 * attempt may already be a document at ARCA, and recording it later needs the
 * inscription it names, so removing one from the roster withdraws it rather
 * than deleting it.
 */
export async function findReservedInscriptionIds(
  kind: "choreography" | "seminar",
  inscriptionIds: string[],
  executor: ComprobanteExecutor = db,
): Promise<string[]> {
  if (inscriptionIds.length === 0) {
    return [];
  }

  // At most one live reservation per series, so the table is a handful of
  // rows: reading every payload is cheaper than querying inside the jsonb.
  const reservations = await executor
    .select({ payload: comprobanteReservations.payload })
    .from(comprobanteReservations);
  const wanted = new Set(inscriptionIds);

  return reservations.flatMap(({ payload }) =>
    payload.lines.flatMap((line) => {
      const id =
        kind === "choreography"
          ? "choreographyInscriptionId" in line
            ? line.choreographyInscriptionId
            : null
          : "seminarInscriptionId" in line
            ? line.seminarInscriptionId
            : null;

      return id !== null && wanted.has(id) ? [id] : [];
    }),
  );
}

/**
 * The latest `CbteFch` this app recorded in a series, which is where ARCA's
 * 10016 date ratchet sits. With no sales point configured every point's
 * comprobantes of the kind count, which can only raise the floor.
 */
export async function readLastAuthorizedCbteFch(series: {
  ptoVta: number | null;
  cbteTipo: number;
}): Promise<string | null> {
  const [row] = await db
    .select({ cbteFch: max(comprobantes.cbteFch) })
    .from(comprobantes)
    .where(
      series.ptoVta === null
        ? eq(comprobantes.cbteTipo, series.cbteTipo)
        : and(
            eq(comprobantes.ptoVta, series.ptoVta),
            eq(comprobantes.cbteTipo, series.cbteTipo),
          ),
    );

  return row?.cbteFch ?? null;
}

/**
 * The failure an emission meets on a live reservation, saying what the
 * operator can do about it: re-check it, or abandon it. A `number-taken` one
 * shows what ARCA holds against what was sent.
 */
export async function blockedBy(
  reservation: ComprobanteReservation,
): Promise<ArcaEmissionFailure> {
  const attempt = {
    ptoVta: reservation.ptoVta,
    cbteTipo: reservation.cbteTipo,
    cbteNro: reservation.cbteNro,
  };

  if (reservation.state === "number-taken") {
    return {
      ok: false,
      reason: "number-taken",
      message: buildNumberTakenMessage({
        attempt,
        submitted: reservation,
        taken: {
          impTotal: reservation.takenImpTotal,
          cbteFch: reservation.takenCbteFch,
        },
      }),
      attempt,
    };
  }

  return {
    ok: false,
    reason: "unverified",
    message: buildSeriesBlockedMessage({
      attempt,
      anchorLabel: await readReservationAnchorLabel(reservation),
      impTotal: reservation.impTotal,
    }),
    attempt,
  };
}

// How each kind is named in the operator's messages about an attempt.
const subjects: Record<KnownComprobanteKind, ArcaContingencySubject> = {
  factura_c: "comprobante",
  nota_debito_c: "nota de débito",
  nota_credito_c: "nota de crédito",
};

export function subjectOf(cbteTipo: number): ArcaContingencySubject {
  const kind = readComprobanteKind(cbteTipo);

  return kind.kind === "unknown" ? "comprobante" : subjects[kind.kind];
}

function reservationAnchorFilter(anchor: ComprobanteAnchor): SQL {
  return anchor.kind === "choreography"
    ? eq(comprobanteReservations.choreographyId, anchor.choreographyId)
    : (and(
        eq(comprobanteReservations.seminarId, anchor.seminarId),
        eq(comprobanteReservations.academyId, anchor.academyId),
      ) as SQL);
}
