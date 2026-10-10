import { and, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  voteCodeBatches,
  voteCodes,
  voters,
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
 * The identity is a printed `voteCode`, worth thirty, or a signed-in `voter`,
 * worth one. They are separate identities: a person holding both casts both.
 */
export type VoteIdentity =
  { kind: "code"; token: string } | { kind: "voter"; voterId: string };

export type CastVoteRefusal =
  | "not-finalist"
  | "round-closed"
  | "unknown-code"
  | "unknown-voter"
  | "voided-code";

export type CastVoteResult =
  | { ok: true }
  | { academyId: string; ok: false; reason: "already-voted" }
  | { ok: false; reason: CastVoteRefusal };

type CastVoteInput = {
  academyId: string;
  identity: VoteIdentity;
  roundId: string;
};

/**
 * Casts the identity's vote for the academy in the round, or answers why it
 * did not count. The insert names its round, its finalist and its identity
 * through the rows it selects, so a closed round, an academy the round did
 * not copy, an unknown voter, an unknown or voided code and a code of another
 * event all insert nothing; only then is the reason read.
 */
export async function castVote(input: CastVoteInput): Promise<CastVoteResult> {
  const inserted = await db
    .insert(votes)
    .select(
      input.identity.kind === "code"
        ? selectCodeVote({ ...input, token: input.identity.token })
        : selectVoterVote({ ...input, voterId: input.identity.voterId }),
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

/** A vote's weight, fixed by its kind. */
const votePoints = { code: 30, social: 1 } as const;

/**
 * The row a cast selects, in the table's column order: an insert from a
 * select fills the columns by position. The identity column of the other
 * kind is null, and the kind sets the weight.
 */
function projectVote(
  identity:
    | { kind: "code"; voteCodeId: typeof voteCodes.id }
    | { kind: "social"; voterId: typeof voters.id },
) {
  return {
    id: sql<string>`${crypto.randomUUID()}`.as("id"),
    roundId: votingRounds.id,
    academyId: votingRoundFinalists.academyId,
    // Literals, not parameters: a parameter in a select list reads as text,
    // which the enum and integer columns refuse.
    kind: sql<typeof identity.kind>`${sql.raw(`'${identity.kind}'`)}`.as(
      "kind",
    ),
    points: sql<number>`${sql.raw(String(votePoints[identity.kind]))}`.as(
      "points",
    ),
    voteCodeId:
      identity.kind === "code"
        ? identity.voteCodeId
        : sql<null>`null`.as("vote_code_id"),
    createdAt: sql<Date>`CURRENT_TIMESTAMP`.as("created_at"),
    voterId:
      identity.kind === "social"
        ? identity.voterId
        : sql<null>`null`.as("voter_id"),
  };
}

/** The finalist of the open round, as a vote joins it. */
function joinOpenRoundFinalist(input: { academyId: string; roundId: string }) {
  return {
    finalist: and(
      eq(votingRoundFinalists.roundId, votingRounds.id),
      eq(votingRoundFinalists.academyId, input.academyId),
    ),
    round: and(
      eq(votingRounds.id, input.roundId),
      isNull(votingRounds.closedAt),
    ),
  };
}

function selectCodeVote(input: {
  academyId: string;
  roundId: string;
  token: string;
}) {
  const joins = joinOpenRoundFinalist(input);

  return (
    db
      .select(projectVote({ kind: "code", voteCodeId: voteCodes.id }))
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
        and(joins.round, eq(votingRounds.eventId, voteCodeBatches.eventId)),
      )
      .innerJoin(votingRoundFinalists, joins.finalist)
      .where(eq(voteCodes.token, input.token))
      // Holds the round and the batch while the vote commits: a close or a
      // void waits for the votes already counting, and a vote behind one
      // re-reads the row it committed and counts nothing.
      .for("share", { of: [votingRounds, voteCodeBatches] })
  );
}

function selectVoterVote(input: {
  academyId: string;
  roundId: string;
  voterId: string;
}) {
  const joins = joinOpenRoundFinalist(input);

  return (
    db
      .select(projectVote({ kind: "social", voterId: voters.id }))
      .from(voters)
      .innerJoin(votingRounds, joins.round)
      .innerJoin(votingRoundFinalists, joins.finalist)
      .where(eq(voters.id, input.voterId))
      // Holds the round while the vote commits, as a code's vote does.
      .for("share", { of: [votingRounds] })
  );
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

export type VoterStanding =
  { academyId: string; status: "voted" } | { status: "available" | "unknown" };

/**
 * Whether the voter already voted in the round, and for whom; unknown when
 * no voter has the id, as a signed cookie can outlive its voter.
 */
export async function readVoterStanding(input: {
  roundId: string;
  voterId: string;
}): Promise<VoterStanding> {
  const [voter] = await db
    .select({ id: voters.id })
    .from(voters)
    .where(eq(voters.id, input.voterId));

  if (!voter) {
    return { status: "unknown" };
  }

  const [vote] = await db
    .select({ academyId: votes.academyId })
    .from(votes)
    .where(
      and(eq(votes.roundId, input.roundId), eq(votes.voterId, input.voterId)),
    );

  return vote
    ? { academyId: vote.academyId, status: "voted" }
    : { status: "available" };
}

/**
 * Why an insert counted nothing, in the order a voter can act on: a closed
 * round first, then the identity, then the academy.
 */
async function explainUncastVote(
  input: CastVoteInput,
): Promise<Exclude<CastVoteResult, { ok: true }>> {
  const [round] = await db
    .select({ closedAt: votingRounds.closedAt })
    .from(votingRounds)
    .where(eq(votingRounds.id, input.roundId));

  if (!round || round.closedAt) {
    return { ok: false, reason: "round-closed" };
  }

  const refusal =
    input.identity.kind === "code"
      ? await explainUncastCodeVote(input.roundId, input.identity.token)
      : await explainUncastVoterVote(input.roundId, input.identity.voterId);

  return refusal ?? { ok: false, reason: "not-finalist" };
}

async function explainUncastCodeVote(roundId: string, token: string) {
  const standing = await readCodeStanding({ roundId, token });

  if (standing.status === "voted") {
    return alreadyVoted(standing.academyId);
  }

  if (standing.status === "unknown") {
    return { ok: false as const, reason: "unknown-code" as const };
  }

  if (standing.status === "voided") {
    return { ok: false as const, reason: "voided-code" as const };
  }

  return null;
}

async function explainUncastVoterVote(roundId: string, voterId: string) {
  const standing = await readVoterStanding({ roundId, voterId });

  if (standing.status === "unknown") {
    return { ok: false as const, reason: "unknown-voter" as const };
  }

  return standing.status === "voted" ? alreadyVoted(standing.academyId) : null;
}

function alreadyVoted(academyId: string) {
  return { academyId, ok: false as const, reason: "already-voted" as const };
}
