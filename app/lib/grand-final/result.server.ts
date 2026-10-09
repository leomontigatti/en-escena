import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  events,
  votes,
  votingRoundFinalists,
  votingRounds,
} from "@/db/schema";
import {
  rankGrandFinal,
  type FinalistTally,
  type GrandFinalOutcome,
  type GrandFinalRanking,
  type RankedFinalist,
} from "@/lib/grand-final/ranking";

/**
 * The `grandFinalResult`: the ranking of the event's last `votingRound`, read
 * off its votes once it closed and never while it is open, and its
 * publication. The ranking rule is `rankGrandFinal`'s; this module reads the
 * tally and owns when a result can be published, hidden, or settled by a
 * `Desempate`.
 */

type Executor = Pick<typeof db, "select">;

type ResultRound = {
  closedAt: Date | null;
  id: string;
  number: number;
  publishedAt: Date | null;
};

export type GrandFinalResult =
  | { roundId: string; roundNumber: number; status: "open" }
  | {
      entries: RankedFinalist[];
      outcome: GrandFinalOutcome;
      publishedAt: Date | null;
      roundId: string;
      roundNumber: number;
      status: "closed";
      tieBrokenByCodeVotes: boolean;
    };

/**
 * The event's result: null before its first round opens, only the round's
 * number while it is open (nothing reveals totals then), and the ranking of
 * the last round once it closed.
 */
export async function readGrandFinalResult(
  eventId: string,
  executor: Executor = db,
): Promise<GrandFinalResult | null> {
  const [round] = await executor
    .select({
      closedAt: votingRounds.closedAt,
      id: votingRounds.id,
      number: votingRounds.number,
      publishedAt: votingRounds.publishedAt,
    })
    .from(votingRounds)
    .where(eq(votingRounds.eventId, eventId))
    .orderBy(desc(votingRounds.number))
    .limit(1);

  if (!round) {
    return null;
  }

  if (!round.closedAt) {
    return { roundId: round.id, roundNumber: round.number, status: "open" };
  }

  return await readClosedRoundResult(round, executor);
}

async function readClosedRoundResult(
  round: ResultRound,
  executor: Executor,
): Promise<Extract<GrandFinalResult, { status: "closed" }>> {
  const ranking = rankGrandFinal(
    round.number,
    await readRoundTally(round.id, executor),
  );

  return {
    ...ranking,
    publishedAt: round.publishedAt,
    roundId: round.id,
    roundNumber: round.number,
    status: "closed",
  };
}

/**
 * The published ranking of a round, for the public page: null unless the
 * round closed and administration published it.
 */
export async function readPublishedRanking(
  round: ResultRound,
): Promise<Pick<GrandFinalRanking, "entries" | "tieBrokenByCodeVotes"> | null> {
  if (!round.closedAt || !round.publishedAt) {
    return null;
  }

  return await readClosedRoundResult(round, db);
}

/** Every finalist the round copied, with its votes in that round only. */
async function readRoundTally(
  roundId: string,
  executor: Executor,
): Promise<FinalistTally[]> {
  return await executor
    .select({
      academyId: votingRoundFinalists.academyId,
      city: academies.city,
      codeVotes:
        sql<number>`count(${votes.id}) filter (where ${votes.kind} = 'code')`.mapWith(
          Number,
        ),
      name: academies.name,
      points: sql<number>`coalesce(sum(${votes.points}), 0)`.mapWith(Number),
      voterVotes:
        sql<number>`count(${votes.id}) filter (where ${votes.kind} = 'social')`.mapWith(
          Number,
        ),
    })
    .from(votingRoundFinalists)
    .innerJoin(academies, eq(academies.id, votingRoundFinalists.academyId))
    .leftJoin(
      votes,
      and(
        eq(votes.roundId, votingRoundFinalists.roundId),
        eq(votes.academyId, votingRoundFinalists.academyId),
      ),
    )
    .where(eq(votingRoundFinalists.roundId, roundId))
    .groupBy(votingRoundFinalists.academyId, academies.name, academies.city);
}

export type PublishBlocker =
  "already-published" | "no-round" | "round-open" | "tie-pending";

/**
 * Why the result cannot be published: no round yet, a round still open, a
 * round 1 tie for first place that a `Desempate` must settle, or a result
 * already public.
 */
export function findPublishBlocker(
  result: GrandFinalResult | null,
): PublishBlocker | null {
  if (!result) {
    return "no-round";
  }

  if (result.status === "open") {
    return "round-open";
  }

  if (result.publishedAt) {
    return "already-published";
  }

  return result.outcome.kind === "tie" ? "tie-pending" : null;
}

export type HideBlocker = "not-published";

export function findHideBlocker(
  result: GrandFinalResult | null,
): HideBlocker | null {
  return result?.status === "closed" && result.publishedAt
    ? null
    : "not-published";
}

export type TieBreakBlocker =
  "already-tie-break" | "no-round" | "no-tie" | "round-open";

/**
 * Every reason a `Desempate` cannot open: no round yet, a round still open, a
 * `Desempate` already held (an event has two rounds at most), or a round 1
 * that closed with a single winner. An open `Desempate` is both still open
 * and already held.
 */
export function findTieBreakBlockers(
  result: GrandFinalResult | null,
): TieBreakBlocker[] {
  if (!result) {
    return ["no-round"];
  }

  const blockers: TieBreakBlocker[] = [];

  if (result.status === "open") {
    blockers.push("round-open");
  }

  if (result.roundNumber > 1) {
    blockers.push("already-tie-break");
  } else if (result.status === "closed" && result.outcome.kind !== "tie") {
    blockers.push("no-tie");
  }

  return blockers;
}

export type PublishGrandFinalResultResult =
  { ok: false; reason: PublishBlocker } | { ok: true; roundNumber: number };

/**
 * Publishes the last round's result, stamping `publishedAt`. The event row is
 * locked first, so a publish and a `Desempate` opening take turns: neither
 * publishes a round 1 the other just superseded.
 */
export async function publishGrandFinalResult(input: {
  eventId: string;
}): Promise<PublishGrandFinalResultResult> {
  return await db.transaction(async (tx) => {
    await lockEvent(tx, input.eventId);
    const result = await readGrandFinalResult(input.eventId, tx);
    const blocker = findPublishBlocker(result);

    if (blocker || result?.status !== "closed") {
      return { ok: false, reason: blocker ?? "round-open" };
    }

    await tx
      .update(votingRounds)
      .set({ publishedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(votingRounds.id, result.roundId));

    return { ok: true, roundNumber: result.roundNumber };
  });
}

export type HideGrandFinalResultResult =
  { ok: false; reason: HideBlocker } | { ok: true };

/** Takes the published result down, clearing `publishedAt`. */
export async function hideGrandFinalResult(input: {
  eventId: string;
}): Promise<HideGrandFinalResultResult> {
  return await db.transaction(async (tx) => {
    await lockEvent(tx, input.eventId);
    const result = await readGrandFinalResult(input.eventId, tx);
    const blocker = findHideBlocker(result);

    if (blocker || result?.status !== "closed") {
      return { ok: false, reason: blocker ?? "not-published" };
    }

    await tx
      .update(votingRounds)
      .set({ publishedAt: null })
      .where(eq(votingRounds.id, result.roundId));

    return { ok: true };
  });
}

/** Locks the event row, so the writes of its rounds take turns. */
export async function lockEvent(
  executor: Pick<typeof db, "select">,
  eventId: string,
) {
  await executor
    .select({ id: events.id })
    .from(events)
    .where(eq(events.id, eventId))
    .for("update");
}
