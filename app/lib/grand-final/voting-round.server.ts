import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  events,
  finalistBanners,
  finalistPicks,
  votingRoundFinalists,
  votingRounds,
} from "@/db/schema";
import type { FinalistBannerKeys } from "@/lib/grand-final/banners.server";
import {
  findTieBreakBlockers,
  lockEvent,
  readGrandFinalResult,
  type TieBreakBlocker,
} from "@/lib/grand-final/result.server";

/**
 * The `Gran final`'s `votingRound`: administration opens it over the event's
 * `finalist`s, copying each with its two banners so a later pick or banner
 * change leaves the round alone, and closes it. When round 1 closes with a
 * tie for first place, the `Desempate` is a second round over the tied
 * academies only.
 */

type Executor = Pick<typeof db, "select" | "selectDistinct">;

export type VotingRoundFinalist = {
  academyId: string;
  city: string | null;
  keys: Record<keyof FinalistBannerKeys, string>;
  name: string;
};

export type CurrentVotingRound = {
  closedAt: Date | null;
  finalists: VotingRoundFinalist[];
  id: string;
  number: number;
  openedAt: Date;
  publishedAt: Date | null;
};

/**
 * Why the round cannot open now. Every one that applies is listed: a round
 * already open or closed, no finalist yet, or finalists short of banners,
 * named so administration knows whose to upload.
 */
export type VotingRoundOpenBlocker =
  | { code: "already-closed" }
  | { code: "already-open" }
  | { code: "missing-banners"; academyNames: string[] }
  | { code: "no-finalists" };

export type OpenVotingRoundResult =
  | { blockers: VotingRoundOpenBlocker[]; ok: false }
  | { number: number; ok: true };

/**
 * Opens round 1 over the finalists as they stand, or answers with every
 * blocker. The event row is locked first, so two opens at once take turns and
 * the second finds the round the first opened; the event's banner rows next,
 * so an open and a banner save take turns too.
 */
export async function openVotingRound(input: {
  eventId: string;
}): Promise<OpenVotingRoundResult> {
  return await db.transaction(async (tx) => {
    await lockEvent(tx, input.eventId);
    // A banner save holds its row until it commits and only then deletes
    // the objects it replaced: waiting for it means the round copies the
    // keys it wrote, and a save that comes after finds them copied.
    await tx
      .select({ id: finalistBanners.id })
      .from(finalistBanners)
      .where(eq(finalistBanners.eventId, input.eventId))
      .for("share");

    const { blockers, finalists } = await readOpenFacts(tx, input.eventId);

    if (blockers.length > 0) {
      return { blockers, ok: false };
    }

    const [round] = await tx
      .insert(votingRounds)
      .values({ eventId: input.eventId, number: 1 })
      .returning({ id: votingRounds.id, number: votingRounds.number });

    await tx.insert(votingRoundFinalists).values(
      finalists.map((finalist) => ({
        academyId: finalist.academyId,
        firstStorageKey: finalist.first,
        roundId: round.id,
        secondStorageKey: finalist.second,
      })),
    );

    return { number: round.number, ok: true };
  });
}

export type OpenTieBreakRoundResult =
  { number: number; ok: true } | { ok: false; reasons: TieBreakBlocker[] };

/**
 * Opens the `Desempate`, round 2, over the academies tied for first place in
 * round 1, each with the banners round 1 copied, or answers why it cannot.
 * Every code is usable again, since a code votes once per round; round 1's
 * votes stay as they are. The event row is locked first, so two opens, or an
 * open and a publish, take turns.
 */
export async function openTieBreakRound(input: {
  eventId: string;
}): Promise<OpenTieBreakRoundResult> {
  return await db.transaction(async (tx) => {
    await lockEvent(tx, input.eventId);
    const result = await readGrandFinalResult(input.eventId, tx);
    const blockers = findTieBreakBlockers(result);

    if (blockers.length > 0 || result?.status !== "closed") {
      return { ok: false, reasons: blockers };
    }

    const tied = await tx
      .select({
        academyId: votingRoundFinalists.academyId,
        firstStorageKey: votingRoundFinalists.firstStorageKey,
        secondStorageKey: votingRoundFinalists.secondStorageKey,
      })
      .from(votingRoundFinalists)
      .where(
        and(
          eq(votingRoundFinalists.roundId, result.roundId),
          inArray(votingRoundFinalists.academyId, result.outcome.academyIds),
        ),
      );
    const [round] = await tx
      .insert(votingRounds)
      .values({ eventId: input.eventId, number: 2 })
      .returning({ id: votingRounds.id, number: votingRounds.number });

    await tx
      .insert(votingRoundFinalists)
      .values(tied.map((finalist) => ({ ...finalist, roundId: round.id })));

    return { number: round.number, ok: true };
  });
}

/** What would refuse `openVotingRound` now, for the list to show before. */
export async function readVotingRoundOpenBlockers(
  eventId: string,
): Promise<VotingRoundOpenBlocker[]> {
  return (await readOpenFacts(db, eventId)).blockers;
}

export type CloseVotingRoundResult =
  { number: number; ok: true } | { ok: false; reason: "not-open" };

/**
 * Closes the named round while it is open, stamping `closedAt`. The round is
 * named, not inferred: a close confirmed over round 1 that arrives after the
 * `Desempate` opened finds round 1 closed and leaves round 2 alone. One
 * conditional update, so a round closed twice at once keeps the first time.
 */
export async function closeVotingRound(input: {
  eventId: string;
  roundId: string;
}): Promise<CloseVotingRoundResult> {
  const [closed] = await db
    .update(votingRounds)
    .set({ closedAt: sql`CURRENT_TIMESTAMP` })
    .where(
      and(
        eq(votingRounds.id, input.roundId),
        eq(votingRounds.eventId, input.eventId),
        isNull(votingRounds.closedAt),
      ),
    )
    .returning({ number: votingRounds.number });

  return closed
    ? { number: closed.number, ok: true }
    : { ok: false, reason: "not-open" };
}

/**
 * The event's latest round with the finalists it copied, by name, or null
 * before the first one opens.
 */
export async function readCurrentVotingRound(
  eventId: string,
): Promise<CurrentVotingRound | null> {
  const [round] = await db
    .select({
      closedAt: votingRounds.closedAt,
      id: votingRounds.id,
      number: votingRounds.number,
      openedAt: votingRounds.openedAt,
      publishedAt: votingRounds.publishedAt,
    })
    .from(votingRounds)
    .where(eq(votingRounds.eventId, eventId))
    .orderBy(desc(votingRounds.number))
    .limit(1);

  if (!round) {
    return null;
  }

  const finalists = await db
    .select({
      academyId: votingRoundFinalists.academyId,
      city: academies.city,
      first: votingRoundFinalists.firstStorageKey,
      name: academies.name,
      second: votingRoundFinalists.secondStorageKey,
    })
    .from(votingRoundFinalists)
    .innerJoin(academies, eq(academies.id, votingRoundFinalists.academyId))
    .where(eq(votingRoundFinalists.roundId, round.id));

  return {
    ...round,
    finalists: finalists
      .map(({ first, second, ...finalist }) => ({
        ...finalist,
        keys: { first, second },
      }))
      .sort((left, right) => left.name.localeCompare(right.name, "es")),
  };
}

async function readOpenFacts(executor: Executor, eventId: string) {
  const [rounds, picked] = await Promise.all([
    executor
      .select({ closedAt: votingRounds.closedAt })
      .from(votingRounds)
      .where(eq(votingRounds.eventId, eventId)),
    executor
      .selectDistinct({ academyId: finalistPicks.academyId })
      .from(finalistPicks)
      .where(eq(finalistPicks.eventId, eventId)),
  ]);
  const academyIds = picked.map((row) => row.academyId);
  const finalists =
    academyIds.length === 0
      ? []
      : await executor
          .select({
            academyId: academies.id,
            first: finalistBanners.firstStorageKey,
            name: academies.name,
            second: finalistBanners.secondStorageKey,
          })
          .from(academies)
          .leftJoin(
            finalistBanners,
            and(
              eq(finalistBanners.academyId, academies.id),
              eq(finalistBanners.eventId, eventId),
            ),
          )
          .where(inArray(academies.id, academyIds));
  const blockers: VotingRoundOpenBlocker[] = [];

  if (rounds.some((round) => round.closedAt === null)) {
    blockers.push({ code: "already-open" });
  } else if (rounds.length > 0) {
    blockers.push({ code: "already-closed" });
  }

  if (finalists.length === 0) {
    blockers.push({ code: "no-finalists" });
  }

  const missing = finalists
    .filter((finalist) => !finalist.first || !finalist.second)
    .map((finalist) => finalist.name)
    .sort((left, right) => left.localeCompare(right, "es"));

  if (missing.length > 0) {
    blockers.push({ academyNames: missing, code: "missing-banners" });
  }

  return {
    blockers,
    finalists: finalists.flatMap(({ academyId, first, second }) =>
      first && second ? [{ academyId, first, second }] : [],
    ),
  };
}

/**
 * The current round of the active event, the one the public vote page shows,
 * or null when no event is active or its first round has not opened.
 */
export async function readActiveEventVotingRound(): Promise<CurrentVotingRound | null> {
  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.active, true))
    .orderBy(desc(events.startsAt))
    .limit(1);

  return event ? await readCurrentVotingRound(event.id) : null;
}
