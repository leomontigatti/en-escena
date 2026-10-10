import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  gt,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import { voteCodeBatches, voteCodes, votes, votingRounds } from "@/db/schema";
import {
  roundsClosedSince,
  type AuditedLink,
} from "@/lib/grand-final/audit-link.server";
import { createAuditTotalsCache } from "@/lib/grand-final/audit-totals-cache";
import { rankGrandFinal, type RankedFinalist } from "@/lib/grand-final/ranking";
import { readRoundTally } from "@/lib/grand-final/result.server";

/**
 * What an `auditLink` shows: its round's live totals, read off the votes
 * table, never a counter. The tally and its order are the result's own
 * (`readRoundTally`, `rankGrandFinal`), so the audit and the published
 * ranking cannot count differently. The figures that cross-check the tally
 * are counted apart from it: codes consumed and distinct voters should match
 * the columns' sums, and an auditor sees it when they do not.
 *
 * A link dies with its round (CONTEXT.md `auditLink`): its round is the one
 * open when it was issued, or else the next one to open. Once that round
 * closed the link shows nothing, a `Desempate` included: the `Desempate`
 * takes links issued for it. Its result is administration's to publish.
 */

export type AuditFinalistTotals = Omit<RankedFinalist, "winner">;

type OpenRoundFigures = {
  codes: {
    /** Codes that voted in this round. */
    consumed: number;
    /** Every code of the event's batches, voided ones included. */
    issued: number;
    /** Codes of voided batches, which vote no more. */
    voided: number;
  };
  /** Signed-in voters who voted in this round. */
  distinctVoters: number;
  finalists: AuditFinalistTotals[];
  roundNumber: number;
};

export type AuditTotals =
  | { status: "not-open" }
  | { roundNumber: number; status: "closed" }
  | (OpenRoundFigures & { status: "open" });

/**
 * A few seconds: an auditor's reload is never more than that behind, and the
 * three of them reloading through voting night count the votes table about
 * once per window between them.
 */
const auditTotalsTtlMs = 5000;

const openRoundFiguresCache = createAuditTotalsCache({
  now: Date.now,
  read: readOpenRoundFigures,
  ttlMs: auditTotalsTtlMs,
});

/**
 * The totals of the link's round. Which round, and whether it is open, is
 * read on every request, so a close shuts the page on the next reload; the
 * open round's figures come from the in-process cache.
 */
export async function readAuditTotals(link: AuditedLink): Promise<AuditTotals> {
  const round = await readLinkRound(link);

  if (!round) {
    return { status: "not-open" };
  }

  if (round.closedAt) {
    return { roundNumber: round.number, status: "closed" };
  }

  return {
    ...(await openRoundFiguresCache.read(round.id)),
    status: "open",
  };
}

/**
 * Whether the link is spent: a round of its event closed after it was
 * issued. A link issued before its round opens, or between round 1's close
 * and the `Desempate`, still lives.
 */
export async function isAuditLinkExpired(link: AuditedLink) {
  const [closed] = await roundsClosedSince(link.eventId, link.issuedAt).limit(
    1,
  );

  return closed !== undefined;
}

/**
 * The round open when the link was issued, or the first to open after it;
 * failing both, the event's last round, closed before the link existed.
 */
async function readLinkRound(link: AuditedLink) {
  const columns = {
    closedAt: votingRounds.closedAt,
    id: votingRounds.id,
    number: votingRounds.number,
  };
  const [round] = await db
    .select(columns)
    .from(votingRounds)
    .where(
      and(
        eq(votingRounds.eventId, link.eventId),
        or(
          isNull(votingRounds.closedAt),
          gt(votingRounds.closedAt, link.issuedAt),
        ),
      ),
    )
    .orderBy(asc(votingRounds.number))
    .limit(1);

  if (round) {
    return round;
  }

  const [last] = await db
    .select(columns)
    .from(votingRounds)
    .where(eq(votingRounds.eventId, link.eventId))
    .orderBy(desc(votingRounds.number))
    .limit(1);

  return last ?? null;
}

/**
 * The open round's figures, read in one snapshot: a vote that commits midway
 * shows in every figure or in none, so the cross-checks never disagree with
 * the tally on their own.
 */
async function readOpenRoundFigures(
  roundId: string,
): Promise<OpenRoundFigures> {
  return await db.transaction(
    async (tx) => {
      const [round] = await tx
        .select({ eventId: votingRounds.eventId, number: votingRounds.number })
        .from(votingRounds)
        .where(eq(votingRounds.id, roundId));
      const tally = await readRoundTally(roundId, tx);
      const [identities] = await tx
        .select({
          consumed: countDistinct(votes.voteCodeId),
          distinctVoters: countDistinct(votes.voterId),
        })
        .from(votes)
        .where(eq(votes.roundId, roundId));
      const [codes] = await tx
        .select({
          issued: sql<number>`count(${voteCodes.id})`.mapWith(Number),
          voided:
            sql<number>`count(${voteCodes.id}) filter (where ${voteCodeBatches.voidedAt} is not null)`.mapWith(
              Number,
            ),
        })
        .from(voteCodes)
        .innerJoin(voteCodeBatches, eq(voteCodeBatches.id, voteCodes.batchId))
        .where(eq(voteCodeBatches.eventId, round.eventId));
      const { entries } = rankGrandFinal(round.number, tally);

      return {
        codes: {
          consumed: identities?.consumed ?? 0,
          issued: codes?.issued ?? 0,
          voided: codes?.voided ?? 0,
        },
        distinctVoters: identities?.distinctVoters ?? 0,
        // Nobody wins while the round is open.
        finalists: entries.map(({ winner: _winner, ...finalist }) => finalist),
        roundNumber: round.number,
      };
    },
    { accessMode: "read only", isolationLevel: "repeatable read" },
  );
}
