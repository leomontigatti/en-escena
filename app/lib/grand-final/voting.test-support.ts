import { db } from "@/db";
import {
  finalistBanners,
  finalistPicks,
  voters,
  votingRoundFinalists,
  votingRounds,
} from "@/db/schema";
import {
  createAcademyUser,
  createSavedEvent,
} from "@/lib/admin/finances/finances.test-support";
import {
  createVoteCodeBatch,
  readVoteCode,
  readVoteCodeBatch,
} from "@/lib/grand-final/vote-codes.server";

import {
  openVotingRound,
  readCurrentVotingRound,
} from "@/lib/grand-final/voting-round.server";

import { seedEligibilityFixture } from "./grand-final.test-support";

/**
 * A round of a fresh event with one academy copied into it, one code of that
 * event and one voter: the rows a vote points at, written straight to the
 * tables.
 */
export async function seedVotingRoundRows(number = 1) {
  const event = await createSavedEvent();
  const { academy } = await createAcademyUser({
    academyName: "Academia Finalista",
    email: `${crypto.randomUUID()}@example.com`,
  });
  const { academy: outsider } = await createAcademyUser({
    academyName: "Academia de Afuera",
    email: `${crypto.randomUUID()}@example.com`,
  });
  const [round] = await db
    .insert(votingRounds)
    .values({ eventId: event.id, number })
    .returning();
  await db.insert(votingRoundFinalists).values({
    academyId: academy.id,
    firstStorageKey: "first.jpg",
    roundId: round.id,
    secondStorageKey: "second.jpg",
  });
  const batch = await createVoteCodeBatch({ count: 1, eventId: event.id });
  const sheet = await readVoteCodeBatch({
    batchId: batch.id,
    eventId: event.id,
  });
  const code = await readVoteCode(sheet?.tokens[0] ?? "");

  return {
    academyId: academy.id,
    codeId: code?.id ?? "",
    eventId: event.id,
    outsiderId: outsider.id,
    roundId: round.id,
    voterId: await seedVoter(),
  };
}

export function codeVote(input: {
  academyId: string;
  codeId: string;
  roundId: string;
}) {
  return {
    academyId: input.academyId,
    kind: "code" as const,
    points: 10,
    roundId: input.roundId,
    voteCodeId: input.codeId,
  };
}

/** A Google `voter`, written straight to its table. */
export async function seedVoter(subject = crypto.randomUUID()) {
  const [voter] = await db
    .insert(voters)
    .values({ provider: "google", subject })
    .returning();

  return voter.id;
}

export function voterVote(input: {
  academyId: string;
  roundId: string;
  voterId: string;
}) {
  return {
    academyId: input.academyId,
    kind: "social" as const,
    points: 1,
    roundId: input.roundId,
    voterId: input.voterId,
  };
}

/**
 * An event whose `finalist`s a test adds by name, each picked by a judge and
 * holding as many of its two banners as asked. Picks and banners are written
 * straight to their tables: eligibility is not what a round test is about.
 */
export async function seedFinalistsFixture() {
  const fixture = await seedEligibilityFixture();
  const judgeId = await fixture.addJudge();

  return {
    eventId: fixture.eventId,
    addFinalist: async (name: string, bannerCount: 0 | 1 | 2 = 2) => {
      const academyId = await fixture.addAcademy(name);
      await pick(academyId);
      await setBanners(academyId, bannerCount);

      return academyId;
    },
    /** An academy of the event that no judge picked. */
    addAcademy: fixture.addAcademy,
    /** Makes the academy the judge's pick in a new modality. */
    pick,
    setBanners,
  };

  async function pick(academyId: string) {
    await db.insert(finalistPicks).values({
      academyId,
      eventId: fixture.eventId,
      judgeId,
      modalityId: await fixture.addModality(
        `Modalidad ${crypto.randomUUID().slice(0, 8)}`,
      ),
    });
  }

  async function setBanners(academyId: string, bannerCount: 0 | 1 | 2) {
    const keys = {
      firstStorageKey:
        bannerCount >= 1 ? `banners/${academyId}/first.jpg` : null,
      secondStorageKey:
        bannerCount >= 2 ? `banners/${academyId}/second.jpg` : null,
    };

    await db
      .insert(finalistBanners)
      .values({ academyId, eventId: fixture.eventId, ...keys })
      .onConflictDoUpdate({
        set: keys,
        target: [finalistBanners.eventId, finalistBanners.academyId],
      });
  }
}

/**
 * An event with round 1 open over two finalists, `Alas` and `Ritmo Sur`, and
 * a way to issue codes of the event, or of another one.
 */
export async function seedOpenRoundFixture() {
  const fixture = await seedFinalistsFixture();
  const alas = await fixture.addFinalist("Alas");
  const ritmo = await fixture.addFinalist("Ritmo Sur");
  const outsider = await fixture.addAcademy("Sin elegir");
  await openVotingRound({ eventId: fixture.eventId });
  const round = await readCurrentVotingRound(fixture.eventId);

  return {
    alas,
    eventId: fixture.eventId,
    outsider,
    ritmo,
    roundId: round?.id ?? "",
    /** Issues a batch of `count` codes and answers their tokens. */
    issueCodes: async (count = 1, eventId = fixture.eventId) => {
      const batch = await createVoteCodeBatch({ count, eventId });
      const sheet = await readVoteCodeBatch({ batchId: batch.id, eventId });

      return { batchId: batch.id, tokens: sheet?.tokens ?? [] };
    },
  };
}
