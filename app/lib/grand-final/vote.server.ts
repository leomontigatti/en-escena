import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  voteCodeBatches,
  voteCodes,
  votes,
  votingRoundFinalists,
  votingRounds,
} from "@/db/schema";

/**
 * Casting a `vote` in the `Gran final`. A vote is one insert: whether the
 * identity already voted in the round is the unique index's answer, never a
 * read made beforehand, so a double tap, a retry or two phones with one code
 * count once however they interleave. A vote and a close of its round, or a
 * void of its batch, take turns. Nothing here updates or deletes a vote.
 *
 * The identity is a printed `voteCode` (worth ten). A signed-in `voter`
 * (worth one) is the second kind this union takes.
 */
export type VoteIdentity = { kind: "code"; token: string };

export type CastVoteRefusal =
  "not-finalist" | "round-closed" | "unknown-code" | "voided-code";

export type CastVoteResult =
  | { ok: true }
  | { academyId: string; ok: false; reason: "already-voted" }
  | { ok: false; reason: CastVoteRefusal };

/**
 * Casts the identity's vote for the academy in the round, or answers why it
 * did not count. The insert names its round, its finalist and its code
 * through the rows it selects, so a closed round, an academy the round did
 * not copy, an unknown or voided code and a code of another event all insert
 * nothing; only then is the reason read.
 */
export async function castVote(input: {
  academyId: string;
  identity: VoteIdentity;
  roundId: string;
}): Promise<CastVoteResult> {
  const inserted = await db
    .insert(votes)
    .select(
      db
        // Positional: the fields follow the table's columns in order.
        .select({
          id: sql<string>`${crypto.randomUUID()}`.as("id"),
          roundId: votingRounds.id,
          academyId: votingRoundFinalists.academyId,
          kind: sql<"code">`'code'`.as("kind"),
          points: sql<number>`10`.as("points"),
          voteCodeId: voteCodes.id,
          createdAt: sql<Date>`CURRENT_TIMESTAMP`.as("created_at"),
        })
        .from(voteCodes)
        .innerJoin(
          voteCodeBatches,
          and(
            eq(voteCodeBatches.id, voteCodes.batchId),
            isNull(voteCodeBatches.voidedAt),
          ),
        )
        .innerJoin(
          votingRounds,
          and(
            eq(votingRounds.id, input.roundId),
            eq(votingRounds.eventId, voteCodeBatches.eventId),
            isNull(votingRounds.closedAt),
          ),
        )
        .innerJoin(
          votingRoundFinalists,
          and(
            eq(votingRoundFinalists.roundId, votingRounds.id),
            eq(votingRoundFinalists.academyId, input.academyId),
          ),
        )
        .where(eq(voteCodes.token, input.identity.token))
        // Holds the round and the batch while the vote commits: a close or a
        // void waits for the votes already counting, and a vote behind one
        // re-reads the row it committed and counts nothing.
        .for("share", { of: [votingRounds, voteCodeBatches] }),
    )
    // Untargeted on purpose: any unique conflict is this identity's earlier
    // vote in the round.
    .onConflictDoNothing()
    .returning({ id: votes.id });

  if (inserted.length > 0) {
    return { ok: true };
  }

  return await explainUncastVote(input);
}

export type CodeStanding =
  | { academyId: string; status: "voted" }
  | { status: "available" | "unknown" | "voided" };

/**
 * Where a code stands in the round: unknown (no batch of the round's event
 * issued it), voided, already voted (and for whom), or still available.
 */
export async function readCodeStanding(input: {
  roundId: string;
  token: string;
}): Promise<CodeStanding> {
  const [code] = await db
    .select({
      votedAcademyId: votes.academyId,
      voidedAt: voteCodeBatches.voidedAt,
    })
    .from(voteCodes)
    .innerJoin(voteCodeBatches, eq(voteCodeBatches.id, voteCodes.batchId))
    .innerJoin(
      votingRounds,
      and(
        eq(votingRounds.id, input.roundId),
        eq(votingRounds.eventId, voteCodeBatches.eventId),
      ),
    )
    .leftJoin(
      votes,
      and(
        eq(votes.roundId, votingRounds.id),
        eq(votes.voteCodeId, voteCodes.id),
      ),
    )
    .where(eq(voteCodes.token, input.token));

  if (!code) {
    return { status: "unknown" };
  }

  // A vote cast before the batch was voided still counts, and still reads as
  // cast.
  if (code.votedAcademyId) {
    return { academyId: code.votedAcademyId, status: "voted" };
  }

  return { status: code.voidedAt ? "voided" : "available" };
}

/**
 * Why an insert counted nothing, in the order a voter can act on: a closed
 * round first, then the code, then the academy.
 */
async function explainUncastVote(input: {
  academyId: string;
  identity: VoteIdentity;
  roundId: string;
}): Promise<Exclude<CastVoteResult, { ok: true }>> {
  const [round] = await db
    .select({ closedAt: votingRounds.closedAt })
    .from(votingRounds)
    .where(eq(votingRounds.id, input.roundId));

  if (!round || round.closedAt) {
    return { ok: false, reason: "round-closed" };
  }

  const standing = await readCodeStanding({
    roundId: input.roundId,
    token: input.identity.token,
  });

  if (standing.status === "voted") {
    return {
      academyId: standing.academyId,
      ok: false,
      reason: "already-voted",
    };
  }

  if (standing.status === "unknown") {
    return { ok: false, reason: "unknown-code" };
  }

  if (standing.status === "voided") {
    return { ok: false, reason: "voided-code" };
  }

  return { ok: false, reason: "not-finalist" };
}
