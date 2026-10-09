import { describe, expect, test } from "vitest";

import {
  hideGrandFinalResult,
  publishGrandFinalResult,
  readGrandFinalResult,
} from "@/lib/grand-final/result.server";
import { openTieBreakRound } from "@/lib/grand-final/voting-round.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";
import {
  closeCurrentVotingRound,
  seedResultFixture,
  seedTiedRoundFixture,
} from "./voting.test-support";

installDatabaseTestHooks();

function standings(result: Awaited<ReturnType<typeof readGrandFinalResult>>) {
  if (result?.status !== "closed") {
    return result;
  }

  return result.entries.map((entry) => ({
    codeVotes: entry.codeVotes,
    name: entry.name,
    percentage: entry.percentage,
    points: entry.points,
    position: entry.position,
    voterVotes: entry.voterVotes,
    winner: entry.winner,
  }));
}

describe("`readGrandFinalResult`", () => {
  test("is null before the event's first round opens", async () => {
    await expect(readGrandFinalResult(crypto.randomUUID())).resolves.toBeNull();
  });

  test("reveals no totals while the round is open", async () => {
    const fixture = await seedResultFixture();
    await fixture.vote(fixture.alas, { voters: 2 });

    await expect(readGrandFinalResult(fixture.eventId)).resolves.toEqual({
      roundId: expect.any(String),
      roundNumber: 1,
      status: "open",
    });
  });

  test("ranks the closed round by weighted points, every finalist included", async () => {
    const fixture = await seedResultFixture();
    const tokens = await fixture.issueCodes(1);
    await fixture.vote(fixture.alas, { tokens });
    await fixture.vote(fixture.ritmo, { voters: 3 });
    await closeCurrentVotingRound(fixture.eventId);

    const result = await readGrandFinalResult(fixture.eventId);

    expect(standings(result)).toEqual([
      {
        codeVotes: 1,
        name: "Alas",
        percentage: 76.9,
        points: 10,
        position: 1,
        voterVotes: 0,
        winner: true,
      },
      {
        codeVotes: 0,
        name: "Ritmo Sur",
        percentage: 23.1,
        points: 3,
        position: 2,
        voterVotes: 3,
        winner: false,
      },
      {
        codeVotes: 0,
        name: "Sol",
        percentage: 0,
        points: 0,
        position: 3,
        voterVotes: 0,
        winner: false,
      },
    ]);
    expect(result).toMatchObject({
      outcome: { academyIds: [fixture.alas], kind: "winner" },
      publishedAt: null,
      roundNumber: 1,
    });
  });

  test("calls no tie when the academies tied are behind the first", async () => {
    const fixture = await seedResultFixture();
    const [first, second] = await fixture.issueCodes(2);
    await fixture.vote(fixture.alas, { tokens: [first] });
    await fixture.vote(fixture.ritmo, { voters: 10 });
    await fixture.vote(fixture.sol, { tokens: [second] });
    await fixture.vote(fixture.sol, { voters: 1 });
    await closeCurrentVotingRound(fixture.eventId);

    await expect(readGrandFinalResult(fixture.eventId)).resolves.toMatchObject({
      outcome: { academyIds: [fixture.sol], kind: "winner" },
    });
  });
});

describe("the result of a tied round 1", () => {
  test("is a tie between the academies sharing the first place", async () => {
    const fixture = await seedTiedRoundFixture();

    await expect(readGrandFinalResult(fixture.eventId)).resolves.toMatchObject({
      outcome: { academyIds: [fixture.alas, fixture.ritmo], kind: "tie" },
    });
  });

  test("cannot be published", async () => {
    const fixture = await seedTiedRoundFixture();

    await expect(
      publishGrandFinalResult({ eventId: fixture.eventId }),
    ).resolves.toEqual({ ok: false, reason: "tie-pending" });
    await expect(readGrandFinalResult(fixture.eventId)).resolves.toMatchObject({
      publishedAt: null,
    });
  });

  test("gives way to the Desempate's, which counts round 2's votes only", async () => {
    const fixture = await seedTiedRoundFixture();
    await openTieBreakRound({ eventId: fixture.eventId });
    await fixture.vote(fixture.ritmo, { voters: 1 });
    await closeCurrentVotingRound(fixture.eventId);

    const result = await readGrandFinalResult(fixture.eventId);

    expect(result).toMatchObject({
      outcome: { academyIds: [fixture.ritmo], kind: "winner" },
      roundNumber: 2,
    });
    expect(standings(result)).toEqual([
      {
        codeVotes: 0,
        name: "Ritmo Sur",
        percentage: 100,
        points: 1,
        position: 1,
        voterVotes: 1,
        winner: true,
      },
      {
        codeVotes: 0,
        name: "Alas",
        percentage: 0,
        points: 0,
        position: 2,
        voterVotes: 0,
        winner: false,
      },
    ]);
  });

  test("hides the Desempate's totals while it is open", async () => {
    const fixture = await seedTiedRoundFixture();
    await openTieBreakRound({ eventId: fixture.eventId });

    await expect(readGrandFinalResult(fixture.eventId)).resolves.toEqual({
      roundId: expect.any(String),
      roundNumber: 2,
      status: "open",
    });
  });
});

describe("the Desempate's result", () => {
  test("breaks a tie on points by the greater number of QR votes, codes of round 1 included", async () => {
    const fixture = await seedTiedRoundFixture();
    await openTieBreakRound({ eventId: fixture.eventId });
    // Alas: one code and ten voters, 20 points. Ritmo Sur: two codes, 20
    // points, one of them the code that voted for Alas in round 1.
    await fixture.vote(fixture.alas, { tokens: [fixture.tokens[2]] });
    await fixture.vote(fixture.alas, { voters: 10 });
    await fixture.vote(fixture.ritmo, {
      tokens: [fixture.tokens[0], fixture.tokens[1]],
    });
    await closeCurrentVotingRound(fixture.eventId);

    const result = await readGrandFinalResult(fixture.eventId);

    expect(result).toMatchObject({
      outcome: { academyIds: [fixture.ritmo], kind: "winner" },
    });
    expect(standings(result)).toMatchObject([
      { name: "Ritmo Sur", percentage: 50, position: 1, winner: true },
      { name: "Alas", percentage: 50, position: 2, winner: false },
    ]);
  });

  test("crowns both when they tie on points and on QR votes, and can be published", async () => {
    const fixture = await seedTiedRoundFixture();
    await openTieBreakRound({ eventId: fixture.eventId });
    await fixture.vote(fixture.alas, { tokens: [fixture.tokens[0]] });
    await fixture.vote(fixture.ritmo, { tokens: [fixture.tokens[1]] });
    await closeCurrentVotingRound(fixture.eventId);

    await expect(
      publishGrandFinalResult({ eventId: fixture.eventId }),
    ).resolves.toEqual({ ok: true, roundNumber: 2 });

    const result = await readGrandFinalResult(fixture.eventId);

    expect(result).toMatchObject({
      outcome: { academyIds: [fixture.alas, fixture.ritmo], kind: "shared" },
      publishedAt: expect.any(Date),
    });
    expect(standings(result)).toMatchObject([
      { name: "Alas", position: 1, winner: true },
      { name: "Ritmo Sur", position: 1, winner: true },
    ]);
  });
});

describe("`publishGrandFinalResult` and `hideGrandFinalResult`", () => {
  test("refuse before any round opens", async () => {
    const eventId = crypto.randomUUID();

    await expect(publishGrandFinalResult({ eventId })).resolves.toEqual({
      ok: false,
      reason: "no-round",
    });
    await expect(hideGrandFinalResult({ eventId })).resolves.toEqual({
      ok: false,
      reason: "not-published",
    });
  });

  test("refuse to publish while the round is open", async () => {
    const fixture = await seedResultFixture();

    await expect(
      publishGrandFinalResult({ eventId: fixture.eventId }),
    ).resolves.toEqual({ ok: false, reason: "round-open" });
  });

  test("publish a closed round once, then hide it, then publish it again", async () => {
    const fixture = await seedResultFixture();
    await fixture.vote(fixture.alas, { voters: 1 });
    await closeCurrentVotingRound(fixture.eventId);

    await expect(
      publishGrandFinalResult({ eventId: fixture.eventId }),
    ).resolves.toEqual({ ok: true, roundNumber: 1 });
    await expect(readGrandFinalResult(fixture.eventId)).resolves.toMatchObject({
      publishedAt: expect.any(Date),
    });
    await expect(
      publishGrandFinalResult({ eventId: fixture.eventId }),
    ).resolves.toEqual({ ok: false, reason: "already-published" });

    await expect(
      hideGrandFinalResult({ eventId: fixture.eventId }),
    ).resolves.toEqual({ ok: true });
    await expect(readGrandFinalResult(fixture.eventId)).resolves.toMatchObject({
      publishedAt: null,
    });
    await expect(
      hideGrandFinalResult({ eventId: fixture.eventId }),
    ).resolves.toEqual({ ok: false, reason: "not-published" });

    await expect(
      publishGrandFinalResult({ eventId: fixture.eventId }),
    ).resolves.toEqual({ ok: true, roundNumber: 1 });
  });
});
