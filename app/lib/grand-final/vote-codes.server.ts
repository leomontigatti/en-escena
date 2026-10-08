import { randomBytes } from "node:crypto";

import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import { events, voteCodeBatches, voteCodes } from "@/db/schema";

/**
 * The `Gran final`'s `voteCode` batches: what administration prints and hands
 * out with the entry tickets, and voids as a whole when a print run is lost.
 * A code is a random token and nothing else, valid on any day; whether it is
 * void is read off its batch.
 */

export type VoteCodeBatchRow = {
  codeCount: number;
  id: string;
  issuedAt: Date;
  number: number;
  voidedAt: Date | null;
};

/**
 * Issues a batch of `count` fresh codes, numbered after the event's last
 * batch. The event row is locked for the numbering, so two batches issued at
 * once never take the same number.
 */
export async function createVoteCodeBatch(input: {
  count: number;
  eventId: string;
}): Promise<{ id: string; number: number }> {
  return await db.transaction(async (tx) => {
    await tx
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, input.eventId))
      .for("update");

    const [last] = await tx
      .select({ number: voteCodeBatches.number })
      .from(voteCodeBatches)
      .where(eq(voteCodeBatches.eventId, input.eventId))
      .orderBy(desc(voteCodeBatches.number))
      .limit(1);
    const [batch] = await tx
      .insert(voteCodeBatches)
      .values({ eventId: input.eventId, number: (last?.number ?? 0) + 1 })
      .returning({ id: voteCodeBatches.id, number: voteCodeBatches.number });

    await tx.insert(voteCodes).values(
      Array.from({ length: input.count }, () => ({
        batchId: batch.id,
        token: generateVoteCodeToken(),
      })),
    );

    return batch;
  });
}

/** The event's batches, the latest first, with how many codes each holds. */
export async function listVoteCodeBatches(
  eventId: string,
): Promise<VoteCodeBatchRow[]> {
  return await db
    .select({
      codeCount: count(voteCodes.id),
      id: voteCodeBatches.id,
      issuedAt: voteCodeBatches.createdAt,
      number: voteCodeBatches.number,
      voidedAt: voteCodeBatches.voidedAt,
    })
    .from(voteCodeBatches)
    .leftJoin(voteCodes, eq(voteCodes.batchId, voteCodeBatches.id))
    .where(eq(voteCodeBatches.eventId, eventId))
    .groupBy(voteCodeBatches.id)
    .orderBy(desc(voteCodeBatches.number));
}

export type VoteCodeBatchSheet = {
  issuedAt: Date;
  number: number;
  tokens: string[];
  voidedAt: Date | null;
};

/**
 * The batch with its tokens, for the printout, or null when the event has no
 * such batch.
 */
export async function readVoteCodeBatch(input: {
  batchId: string;
  eventId: string;
}): Promise<VoteCodeBatchSheet | null> {
  const [batch] = await db
    .select({
      issuedAt: voteCodeBatches.createdAt,
      number: voteCodeBatches.number,
      voidedAt: voteCodeBatches.voidedAt,
    })
    .from(voteCodeBatches)
    .where(
      and(
        eq(voteCodeBatches.id, input.batchId),
        eq(voteCodeBatches.eventId, input.eventId),
      ),
    );

  if (!batch) {
    return null;
  }

  const codes = await db
    .select({ token: voteCodes.token })
    .from(voteCodes)
    .where(eq(voteCodes.batchId, input.batchId))
    .orderBy(asc(voteCodes.id));

  return { ...batch, tokens: codes.map((code) => code.token) };
}

export type VoidVoteCodeBatchResult =
  | { number: number; ok: true }
  | { ok: false; reason: "already-voided" | "not-found" };

/**
 * Voids the batch, and with it every code in it. One conditional update, so a
 * batch voided twice at once keeps the first time and the second reads as
 * already voided. Nothing undoes it.
 */
export async function voidVoteCodeBatch(input: {
  batchId: string;
  eventId: string;
}): Promise<VoidVoteCodeBatchResult> {
  const inEvent = and(
    eq(voteCodeBatches.id, input.batchId),
    eq(voteCodeBatches.eventId, input.eventId),
  );
  const voided = await db
    .update(voteCodeBatches)
    .set({ voidedAt: sql`CURRENT_TIMESTAMP` })
    .where(and(inEvent, isNull(voteCodeBatches.voidedAt)))
    .returning({ number: voteCodeBatches.number });

  if (voided[0]) {
    return { number: voided[0].number, ok: true };
  }

  const [existing] = await db
    .select({ id: voteCodeBatches.id })
    .from(voteCodeBatches)
    .where(inEvent);

  return { ok: false, reason: existing ? "already-voided" : "not-found" };
}

/**
 * The code a token names, with its event and whether its batch was voided, or
 * null for a token no batch issued. What the vote reads before it counts one.
 */
export async function readVoteCode(token: string): Promise<{
  eventId: string;
  id: string;
  voided: boolean;
} | null> {
  const [code] = await db
    .select({
      eventId: voteCodeBatches.eventId,
      id: voteCodes.id,
      voidedAt: voteCodeBatches.voidedAt,
    })
    .from(voteCodes)
    .innerJoin(voteCodeBatches, eq(voteCodeBatches.id, voteCodes.batchId))
    .where(eq(voteCodes.token, token));

  return code
    ? { eventId: code.eventId, id: code.id, voided: code.voidedAt !== null }
    : null;
}

/**
 * 128 random bits, base64url: 22 characters a QR holds easily and nobody can
 * guess or walk from one printed code to the next.
 */
function generateVoteCodeToken() {
  return randomBytes(16).toString("base64url");
}
