import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academies,
  events,
  voteCodes,
  voters,
  votes,
  votingRoundFinalists,
  votingRounds,
} from "@/db/schema";
import {
  codeVote,
  seedVotingRoundRows,
  voterVote,
} from "@/lib/grand-final/voting.test-support";

import { installDatabaseTestHooks } from "../../tests/db/harness";

installDatabaseTestHooks();

type Seeded = Awaited<ReturnType<typeof seedVotingRoundRows>>;

describe("the vote table", () => {
  test("takes one vote per code in a round", async () => {
    const seeded = await seedVotingRoundRows();

    await db.insert(votes).values(codeVote(seeded));

    await expect(db.insert(votes).values(codeVote(seeded))).rejects.toThrow();
  });

  test("takes the same code again in another round of the event", async () => {
    const seeded = await seedVotingRoundRows();
    const [tieBreak] = await db
      .insert(votingRounds)
      .values({ eventId: seeded.eventId, number: 2 })
      .returning();
    await db.insert(votingRoundFinalists).values({
      academyId: seeded.academyId,
      firstStorageKey: "first.jpg",
      roundId: tieBreak.id,
      secondStorageKey: "second.jpg",
    });

    await db.insert(votes).values(codeVote(seeded));
    await db
      .insert(votes)
      .values(codeVote({ ...seeded, roundId: tieBreak.id }));

    await expect(db.$count(votes)).resolves.toBe(2);
  });

  test("refuses a vote for an academy the round did not copy", async () => {
    const seeded = await seedVotingRoundRows();

    await expect(
      db
        .insert(votes)
        .values(codeVote({ ...seeded, academyId: seeded.outsiderId })),
    ).rejects.toThrow();
  });

  test.each([
    { label: "a code vote worth one", points: 1 },
    { label: "a code vote worth anything but ten", points: 5 },
  ])("refuses $label", async ({ points }) => {
    const seeded = await seedVotingRoundRows();

    await expect(
      db.insert(votes).values({ ...codeVote(seeded), points }),
    ).rejects.toThrow();
  });

  test("refuses a code vote with no code", async () => {
    const seeded = await seedVotingRoundRows();

    await expect(
      db.insert(votes).values({ ...codeVote(seeded), voteCodeId: null }),
    ).rejects.toThrow();
  });

  test("takes one vote per voter in a round, beside a code's", async () => {
    const seeded = await seedVotingRoundRows();

    await db.insert(votes).values(codeVote(seeded));
    await db.insert(votes).values(voterVote(seeded));

    await expect(db.insert(votes).values(voterVote(seeded))).rejects.toThrow();
    await expect(db.$count(votes)).resolves.toBe(2);
  });

  test("takes the same voter again in another round of the event", async () => {
    const seeded = await seedVotingRoundRows();
    const [tieBreak] = await db
      .insert(votingRounds)
      .values({ eventId: seeded.eventId, number: 2 })
      .returning();
    await db.insert(votingRoundFinalists).values({
      academyId: seeded.academyId,
      firstStorageKey: "first.jpg",
      roundId: tieBreak.id,
      secondStorageKey: "second.jpg",
    });

    await db.insert(votes).values(voterVote(seeded));
    await db
      .insert(votes)
      .values(voterVote({ ...seeded, roundId: tieBreak.id }));

    await expect(db.$count(votes)).resolves.toBe(2);
  });

  test("keeps one identity on a vote, by its kind", async () => {
    const seeded = await seedVotingRoundRows();

    await expect(
      db.insert(votes).values({ ...voterVote(seeded), points: 10 }),
    ).rejects.toThrow();
    await expect(
      db.insert(votes).values({ ...codeVote(seeded), voterId: seeded.voterId }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(votes)
        .values({ ...voterVote(seeded), voteCodeId: seeded.codeId }),
    ).rejects.toThrow();
  });

  test("refuses a voter vote with no voter", async () => {
    const seeded = await seedVotingRoundRows();

    await expect(
      db
        .insert(votes)
        .values(voterVote({ ...seeded, voterId: null as unknown as string })),
    ).rejects.toThrow();
  });

  test("refuses a third round, and a second round 1", async () => {
    const seeded = await seedVotingRoundRows();

    await expect(
      db.insert(votingRounds).values({ eventId: seeded.eventId, number: 3 }),
    ).rejects.toThrow();
    await expect(
      db.insert(votingRounds).values({ eventId: seeded.eventId, number: 1 }),
    ).rejects.toThrow();
  });
});

/** What the append-only trigger raises: `restrict_violation`. */
const refusedByTheTrigger = {
  cause: expect.objectContaining({ code: "23001" }),
};

describe("a cast vote", () => {
  test("is never updated", async () => {
    const seeded = await seedVotingRoundRows();
    const [vote] = await db.insert(votes).values(codeVote(seeded)).returning();

    await expect(
      db
        .update(votes)
        .set({ createdAt: new Date() })
        .where(eq(votes.id, vote.id)),
    ).rejects.toMatchObject(refusedByTheTrigger);
  });

  test("is never deleted on its own", async () => {
    const seeded = await seedVotingRoundRows();
    const [vote] = await db.insert(votes).values(codeVote(seeded)).returning();

    await expect(
      db.delete(votes).where(eq(votes.id, vote.id)),
    ).rejects.toMatchObject(refusedByTheTrigger);
    await expect(db.$count(votes)).resolves.toBe(1);
  });

  test("keeps its academy from being deleted under it", async () => {
    const seeded = await seedVotingRoundRows();
    await db.insert(votes).values(codeVote(seeded));

    await expect(
      db
        .delete(votingRoundFinalists)
        .where(eq(votingRoundFinalists.academyId, seeded.academyId)),
    ).rejects.toThrow();
  });

  test.each([
    {
      deleted: "its event",
      remove: (seeded: Seeded) =>
        db.delete(events).where(eq(events.id, seeded.eventId)),
    },
    {
      deleted: "its round",
      remove: (seeded: Seeded) =>
        db.delete(votingRounds).where(eq(votingRounds.id, seeded.roundId)),
    },
    {
      deleted: "its academy",
      remove: (seeded: Seeded) =>
        db.delete(academies).where(eq(academies.id, seeded.academyId)),
    },
    {
      deleted: "its voter",
      remove: (seeded: Seeded) =>
        db.delete(voters).where(eq(voters.id, seeded.voterId)),
    },
    {
      deleted: "its code",
      remove: (seeded: Seeded) =>
        db.delete(voteCodes).where(eq(voteCodes.id, seeded.codeId)),
    },
  ])("keeps $deleted from being deleted, and stays", async ({ remove }) => {
    const seeded = await seedVotingRoundRows();
    await db.insert(votes).values([codeVote(seeded), voterVote(seeded)]);

    await expect(remove(seeded)).rejects.toThrow();
    await expect(db.$count(votes)).resolves.toBe(2);
  });
});
