import { describe, expect, test, vi } from "vitest";

import {
  isAuditLinkExpired,
  readAuditTotals,
} from "@/lib/grand-final/audit-totals.server";
import {
  listVoteCodeBatches,
  voidVoteCodeBatch,
} from "@/lib/grand-final/vote-codes.server";
import {
  openTieBreakRound,
  openVotingRound,
} from "@/lib/grand-final/voting-round.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";
import {
  closeCurrentVotingRound,
  seedFinalistsFixture,
  seedResultFixture,
  seedTiedRoundFixture,
} from "./voting.test-support";

installDatabaseTestHooks();

/**
 * A link of the event as its session reads it, issued now unless the test
 * says when. A round's `closedAt` is the database's clock to the microsecond
 * and `issuedAt` is JavaScript's to the millisecond, so a link issued right
 * after a close can share its millisecond and read as issued before it: a
 * link meant to follow a close is issued past it by hand.
 */
function linkOf(eventId: string, issuedAt = new Date()) {
  return { eventId, issuedAt };
}

describe("`readAuditTotals`", () => {
  test("says the vote has not opened before the event's first round", async () => {
    await expect(readAuditTotals(linkOf(crypto.randomUUID()))).resolves.toEqual(
      {
        status: "not-open",
      },
    );
  });

  test("splits each finalist's votes between voters and codes while the round is open", async () => {
    const fixture = await seedResultFixture();
    const tokens = await fixture.issueCodes(2);
    await fixture.vote(fixture.alas, { tokens: [tokens[0]], voters: 1 });
    await fixture.vote(fixture.ritmo, { voters: 3 });

    const totals = await readAuditTotals(linkOf(fixture.eventId));

    expect(totals).toMatchObject({ roundNumber: 1, status: "open" });
    expect(
      totals.status === "open"
        ? totals.finalists.map((finalist) => ({
            codeVotes: finalist.codeVotes,
            name: finalist.name,
            percentage: finalist.percentage,
            points: finalist.points,
            voterVotes: finalist.voterVotes,
          }))
        : null,
    ).toEqual([
      {
        codeVotes: 1,
        name: "Alas",
        percentage: 91.2,
        points: 31,
        voterVotes: 1,
      },
      {
        codeVotes: 0,
        name: "Ritmo Sur",
        percentage: 8.8,
        points: 3,
        voterVotes: 3,
      },
      { codeVotes: 0, name: "Sol", percentage: 0, points: 0, voterVotes: 0 },
    ]);
  });

  test("counts codes consumed against codes issued, a voided batch's apart", async () => {
    const fixture = await seedResultFixture();
    const tokens = await fixture.issueCodes(3);
    await fixture.vote(fixture.alas, { tokens: tokens.slice(0, 2) });
    await fixture.issueCodes(4);
    // The latest batch first: the four spare codes.
    const [spareBatch] = await listVoteCodeBatches(fixture.eventId);
    await voidVoteCodeBatch({
      batchId: spareBatch.id,
      eventId: fixture.eventId,
    });

    await expect(
      readAuditTotals(linkOf(fixture.eventId)),
    ).resolves.toMatchObject({
      codes: { consumed: 2, issued: 7, voided: 4 },
    });
  });

  test("counts the distinct voters who voted in the round", async () => {
    const fixture = await seedResultFixture();
    const tokens = await fixture.issueCodes(1);
    await fixture.vote(fixture.alas, { tokens, voters: 2 });
    await fixture.vote(fixture.sol, { voters: 1 });

    await expect(
      readAuditTotals(linkOf(fixture.eventId)),
    ).resolves.toMatchObject({
      distinctVoters: 3,
    });
  });

  test("shows no totals once the round closed", async () => {
    const fixture = await seedResultFixture();
    const link = linkOf(fixture.eventId, new Date(Date.now() - 1000));
    await fixture.vote(fixture.alas, { voters: 1 });
    await closeCurrentVotingRound(fixture.eventId);

    await expect(readAuditTotals(link)).resolves.toEqual({
      roundNumber: 1,
      status: "closed",
    });
  });

  test("dies with its round: a link of round 1 never shows the `Desempate`", async () => {
    const fixture = await seedResultFixture();
    const tokens = await fixture.issueCodes(1);
    await fixture.vote(fixture.alas, { tokens });
    await fixture.vote(fixture.ritmo, { voters: 30 });
    const link = linkOf(fixture.eventId, new Date(Date.now() - 1000));
    await closeCurrentVotingRound(fixture.eventId);
    await expect(
      openTieBreakRound({ eventId: fixture.eventId }),
    ).resolves.toEqual({ number: 2, ok: true });

    await expect(readAuditTotals(link)).resolves.toEqual({
      roundNumber: 1,
      status: "closed",
    });
  });

  test("serves the first round to open after a link issued before any", async () => {
    const fixture = await seedFinalistsFixture();
    await fixture.addFinalist("Alas");
    const link = linkOf(fixture.eventId);

    await expect(readAuditTotals(link)).resolves.toEqual({
      status: "not-open",
    });

    await openVotingRound({ eventId: fixture.eventId });

    await expect(readAuditTotals(link)).resolves.toMatchObject({
      roundNumber: 1,
      status: "open",
    });
  });

  test("reads a link issued after every round closed as closed", async () => {
    const fixture = await seedResultFixture();
    await closeCurrentVotingRound(fixture.eventId);

    await expect(
      readAuditTotals(linkOf(fixture.eventId, new Date(Date.now() + 1000))),
    ).resolves.toEqual({ roundNumber: 1, status: "closed" });
  });

  test("reads the open `Desempate` alone for a link issued after round 1, its codes consumed afresh", async () => {
    const fixture = await seedTiedRoundFixture();
    await openTieBreakRound({ eventId: fixture.eventId });
    await fixture.vote(fixture.ritmo, { tokens: [fixture.tokens[0]] });

    const totals = await readAuditTotals(
      linkOf(fixture.eventId, new Date(Date.now() + 1000)),
    );

    expect(totals).toMatchObject({
      codes: { consumed: 1, issued: 3, voided: 0 },
      distinctVoters: 0,
      roundNumber: 2,
      status: "open",
    });
    expect(
      totals.status === "open"
        ? totals.finalists.map((finalist) => [finalist.name, finalist.points])
        : null,
    ).toEqual([
      ["Ritmo Sur", 30],
      ["Alas", 0],
    ]);
  });
});

describe("`isAuditLinkExpired`", () => {
  test("keeps a link alive before its round opens and while it is open, and not after it closes", async () => {
    const fixture = await seedFinalistsFixture();
    await fixture.addFinalist("Alas");
    const link = linkOf(fixture.eventId);

    await expect(isAuditLinkExpired(link)).resolves.toBe(false);

    await openVotingRound({ eventId: fixture.eventId });
    await expect(isAuditLinkExpired(link)).resolves.toBe(false);

    await closeCurrentVotingRound(fixture.eventId);
    await expect(isAuditLinkExpired(link)).resolves.toBe(true);
  });

  test("keeps a link issued between round 1 and the `Desempate` alive until the `Desempate` closes", async () => {
    const fixture = await seedTiedRoundFixture();
    // A millisecond past now, so past round 1's close however close it was,
    // and the `Desempate` closes only once the clock has passed the link: each
    // close falls on its side of it.
    const link = linkOf(fixture.eventId, new Date(Date.now() + 1));

    await expect(isAuditLinkExpired(link)).resolves.toBe(false);

    await openTieBreakRound({ eventId: fixture.eventId });
    await expect(isAuditLinkExpired(link)).resolves.toBe(false);

    await vi.waitUntil(() => Date.now() > link.issuedAt.getTime());
    await closeCurrentVotingRound(fixture.eventId);
    await expect(isAuditLinkExpired(link)).resolves.toBe(true);
  });
});
