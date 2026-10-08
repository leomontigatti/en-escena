import { eq, sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { voteCodeBatches, votes, votingRounds } from "@/db/schema";
import { castVote, readCodeStanding } from "@/lib/grand-final/vote.server";
import { voidVoteCodeBatch } from "@/lib/grand-final/vote-codes.server";
import { closeVotingRound } from "@/lib/grand-final/voting-round.server";

import {
  installDatabaseTestHooks,
  isPgliteTestBackend,
} from "../../../tests/db/harness";
import { runBehindAHolder } from "../../../tests/db/lock-contention";
import { seedOpenRoundFixture } from "./voting.test-support";

installDatabaseTestHooks();

async function readVotes() {
  return await db
    .select({
      academyId: votes.academyId,
      kind: votes.kind,
      points: votes.points,
      roundId: votes.roundId,
    })
    .from(votes);
}

describe("`castVote` with a code", () => {
  test("casts one vote worth ten for the academy, in the round", async () => {
    const round = await seedOpenRoundFixture();
    const {
      tokens: [token],
    } = await round.issueCodes();

    await expect(
      castVote({
        academyId: round.alas,
        identity: { kind: "code", token },
        roundId: round.roundId,
      }),
    ).resolves.toEqual({ ok: true });

    await expect(readVotes()).resolves.toEqual([
      {
        academyId: round.alas,
        kind: "code",
        points: 10,
        roundId: round.roundId,
      },
    ]);
  });

  test("reads a second vote with the same code as already cast, for the first academy, and counts one", async () => {
    const round = await seedOpenRoundFixture();
    const {
      tokens: [token],
    } = await round.issueCodes();
    const vote = (academyId: string) =>
      castVote({
        academyId,
        identity: { kind: "code", token },
        roundId: round.roundId,
      });

    await vote(round.alas);

    await expect(vote(round.ritmo)).resolves.toEqual({
      academyId: round.alas,
      ok: false,
      reason: "already-voted",
    });
    await expect(db.$count(votes)).resolves.toBe(1);
  });

  // Fails without the unique index on (round, code): both inserts land.
  test("counts one vote when the same code is cast twice at once", async () => {
    const round = await seedOpenRoundFixture();
    const {
      tokens: [token],
    } = await round.issueCodes();

    const results = await Promise.all(
      [round.alas, round.ritmo].map((academyId) =>
        castVote({
          academyId,
          identity: { kind: "code", token },
          roundId: round.roundId,
        }),
      ),
    );

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results).toContainEqual(
      expect.objectContaining({ ok: false, reason: "already-voted" }),
    );
    await expect(db.$count(votes)).resolves.toBe(1);
  });

  test("lets each code of a batch vote once", async () => {
    const round = await seedOpenRoundFixture();
    const { tokens } = await round.issueCodes(3);

    for (const token of tokens) {
      await castVote({
        academyId: round.ritmo,
        identity: { kind: "code", token },
        roundId: round.roundId,
      });
    }

    await expect(db.$count(votes)).resolves.toBe(3);
  });

  test("refuses a code of a voided batch", async () => {
    const round = await seedOpenRoundFixture();
    const {
      batchId,
      tokens: [token],
    } = await round.issueCodes();
    await voidVoteCodeBatch({ batchId, eventId: round.eventId });

    await expect(
      castVote({
        academyId: round.alas,
        identity: { kind: "code", token },
        roundId: round.roundId,
      }),
    ).resolves.toEqual({ ok: false, reason: "voided-code" });
    await expect(db.$count(votes)).resolves.toBe(0);
  });

  test.each([
    { label: "a token no batch issued", eventOfCode: "none" as const },
    { label: "a code of another event", eventOfCode: "other" as const },
  ])("refuses $label as unknown", async ({ eventOfCode }) => {
    const round = await seedOpenRoundFixture();
    const other = await seedOpenRoundFixture();
    const token =
      eventOfCode === "none"
        ? "AAAAAAAAAAAAAAAAAAAAAA"
        : (await other.issueCodes()).tokens[0];

    await expect(
      castVote({
        academyId: round.alas,
        identity: { kind: "code", token },
        roundId: round.roundId,
      }),
    ).resolves.toEqual({ ok: false, reason: "unknown-code" });
    await expect(db.$count(votes)).resolves.toBe(0);
  });

  test("refuses a vote once the round closed", async () => {
    const round = await seedOpenRoundFixture();
    const {
      tokens: [token],
    } = await round.issueCodes();
    await closeVotingRound({ eventId: round.eventId });

    await expect(
      castVote({
        academyId: round.alas,
        identity: { kind: "code", token },
        roundId: round.roundId,
      }),
    ).resolves.toEqual({ ok: false, reason: "round-closed" });
    await expect(db.$count(votes)).resolves.toBe(0);
  });

  test("refuses an academy the round did not copy", async () => {
    const round = await seedOpenRoundFixture();
    const {
      tokens: [token],
    } = await round.issueCodes();

    await expect(
      castVote({
        academyId: round.outsider,
        identity: { kind: "code", token },
        roundId: round.roundId,
      }),
    ).resolves.toEqual({ ok: false, reason: "not-finalist" });
    await expect(db.$count(votes)).resolves.toBe(0);
  });
});

describe("`readCodeStanding`", () => {
  test("reads a code as available, then as voted for its academy", async () => {
    const round = await seedOpenRoundFixture();
    const {
      tokens: [token],
    } = await round.issueCodes();
    const standing = () => readCodeStanding({ roundId: round.roundId, token });

    await expect(standing()).resolves.toEqual({ status: "available" });

    await castVote({
      academyId: round.ritmo,
      identity: { kind: "code", token },
      roundId: round.roundId,
    });

    await expect(standing()).resolves.toEqual({
      academyId: round.ritmo,
      status: "voted",
    });
  });

  // Voiding stops new votes; it does not take back the one already cast.
  test("keeps reading a code as voted after its batch is voided", async () => {
    const round = await seedOpenRoundFixture();
    const {
      batchId,
      tokens: [token],
    } = await round.issueCodes();
    await castVote({
      academyId: round.alas,
      identity: { kind: "code", token },
      roundId: round.roundId,
    });
    await voidVoteCodeBatch({ batchId, eventId: round.eventId });

    await expect(
      readCodeStanding({ roundId: round.roundId, token }),
    ).resolves.toEqual({ academyId: round.alas, status: "voted" });
  });
});

/**
 * A vote cast while a close of its round, or a void of its batch, is still
 * committing waits for it and counts nothing: the round or batch it checked
 * is the one the other write leaves. A single PGlite connection serialises
 * transactions on its own, so this runs on Postgres only.
 */
describe.skipIf(isPgliteTestBackend())(
  "`castVote` behind a close or a void",
  () => {
    test("counts nothing behind a close of the round", async () => {
      const round = await seedOpenRoundFixture();
      const {
        tokens: [token],
      } = await round.issueCodes();

      const cast = await runBehindAHolder({
        waitingOn: "round row",
        hold: (tx) =>
          tx
            .update(votingRounds)
            .set({ closedAt: sql`CURRENT_TIMESTAMP` })
            .where(eq(votingRounds.id, round.roundId)),
        contender: () =>
          castVote({
            academyId: round.alas,
            identity: { kind: "code", token },
            roundId: round.roundId,
          }),
      });

      expect(cast).toEqual({ ok: false, reason: "round-closed" });
      await expect(db.$count(votes)).resolves.toBe(0);
    });

    test("counts nothing behind a void of the code's batch", async () => {
      const round = await seedOpenRoundFixture();
      const {
        batchId,
        tokens: [token],
      } = await round.issueCodes();

      const cast = await runBehindAHolder({
        waitingOn: "batch row",
        hold: (tx) =>
          tx
            .update(voteCodeBatches)
            .set({ voidedAt: sql`CURRENT_TIMESTAMP` })
            .where(eq(voteCodeBatches.id, batchId)),
        contender: () =>
          castVote({
            academyId: round.alas,
            identity: { kind: "code", token },
            roundId: round.roundId,
          }),
      });

      expect(cast).toEqual({ ok: false, reason: "voided-code" });
      await expect(db.$count(votes)).resolves.toBe(0);
    });
  },
);
