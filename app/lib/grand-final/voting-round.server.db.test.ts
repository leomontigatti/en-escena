import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { finalistBanners, votes } from "@/db/schema";
import { castVote } from "@/lib/grand-final/vote.server";

import {
  closeVotingRound,
  openTieBreakRound,
  openVotingRound,
  readCurrentVotingRound,
  readVotingRoundOpenBlockers,
} from "@/lib/grand-final/voting-round.server";

import {
  installDatabaseTestHooks,
  isPgliteTestBackend,
} from "../../../tests/db/harness";
import { runBehindAHolder } from "../../../tests/db/lock-contention";
import {
  closeCurrentVotingRound,
  seedFinalistsFixture,
  seedResultFixture,
  seedTiedRoundFixture,
} from "./voting.test-support";

installDatabaseTestHooks();

describe("`openVotingRound`", () => {
  test("opens round 1 with a copy of every finalist and its two banners", async () => {
    const fixture = await seedFinalistsFixture();
    const ritmo = await fixture.addFinalist("Ritmo Sur");
    const alas = await fixture.addFinalist("Alas");
    await fixture.addAcademy("Sin elegir");

    await expect(
      openVotingRound({ eventId: fixture.eventId }),
    ).resolves.toEqual({ ok: true, number: 1 });

    await expect(readCurrentVotingRound(fixture.eventId)).resolves.toEqual({
      closedAt: null,
      finalists: [
        {
          academyId: alas,
          city: null,
          keys: {
            first: `banners/${alas}/first.jpg`,
            second: `banners/${alas}/second.jpg`,
          },
          name: "Alas",
        },
        {
          academyId: ritmo,
          city: null,
          keys: {
            first: `banners/${ritmo}/first.jpg`,
            second: `banners/${ritmo}/second.jpg`,
          },
          name: "Ritmo Sur",
        },
      ],
      id: expect.any(String),
      number: 1,
      openedAt: expect.any(Date),
      publishedAt: null,
    });
  });

  test("is refused while a finalist lacks a banner, naming each such finalist, and opens nothing", async () => {
    const fixture = await seedFinalistsFixture();
    await fixture.addFinalist("Ritmo Sur", 1);
    await fixture.addFinalist("Alas", 0);
    await fixture.addFinalist("Completa");

    const expected = [
      { academyNames: ["Alas", "Ritmo Sur"], code: "missing-banners" },
    ];

    await expect(readVotingRoundOpenBlockers(fixture.eventId)).resolves.toEqual(
      expected,
    );
    await expect(
      openVotingRound({ eventId: fixture.eventId }),
    ).resolves.toEqual({ blockers: expected, ok: false });
    await expect(readCurrentVotingRound(fixture.eventId)).resolves.toBeNull();
  });

  test("is refused while no judge picked a finalist", async () => {
    const fixture = await seedFinalistsFixture();

    await expect(
      openVotingRound({ eventId: fixture.eventId }),
    ).resolves.toEqual({ blockers: [{ code: "no-finalists" }], ok: false });
  });

  test("is refused while the round is open, and after it closed", async () => {
    const fixture = await seedFinalistsFixture();
    await fixture.addFinalist("Alas");
    await openVotingRound({ eventId: fixture.eventId });

    await expect(
      openVotingRound({ eventId: fixture.eventId }),
    ).resolves.toEqual({ blockers: [{ code: "already-open" }], ok: false });

    await closeCurrentVotingRound(fixture.eventId);

    await expect(
      openVotingRound({ eventId: fixture.eventId }),
    ).resolves.toEqual({ blockers: [{ code: "already-closed" }], ok: false });
  });

  test("opens one round when asked twice at once", async () => {
    const fixture = await seedFinalistsFixture();
    await fixture.addFinalist("Alas");

    const results = await Promise.all([
      openVotingRound({ eventId: fixture.eventId }),
      openVotingRound({ eventId: fixture.eventId }),
    ]);

    expect(results).toEqual(
      expect.arrayContaining([
        { number: 1, ok: true },
        { blockers: [{ code: "already-open" }], ok: false },
      ]),
    );
  });

  test("keeps its finalists and their banners when picks and banners change after it opened", async () => {
    const fixture = await seedFinalistsFixture();
    const alas = await fixture.addFinalist("Alas");
    await openVotingRound({ eventId: fixture.eventId });
    const before = await readCurrentVotingRound(fixture.eventId);

    await fixture.addFinalist("Elegida tarde");
    await fixture.setBanners(alas, 0);

    await expect(readCurrentVotingRound(fixture.eventId)).resolves.toEqual(
      before,
    );
    expect(before?.finalists.map((finalist) => finalist.academyId)).toEqual([
      alas,
    ]);
  });
});

describe("`closeVotingRound`", () => {
  test("stamps when the open round closed", async () => {
    const fixture = await seedFinalistsFixture();
    await fixture.addFinalist("Alas");
    await openVotingRound({ eventId: fixture.eventId });

    await expect(closeCurrentVotingRound(fixture.eventId)).resolves.toEqual({
      number: 1,
      ok: true,
    });

    const round = await readCurrentVotingRound(fixture.eventId);
    expect(round?.closedAt).toBeInstanceOf(Date);
  });

  test("answers that no round is open, before one opens and once it closed", async () => {
    const fixture = await seedFinalistsFixture();
    await fixture.addFinalist("Alas");

    await expect(closeCurrentVotingRound(fixture.eventId)).resolves.toEqual({
      ok: false,
      reason: "not-open",
    });

    await openVotingRound({ eventId: fixture.eventId });
    await closeCurrentVotingRound(fixture.eventId);
    const closedAt = (await readCurrentVotingRound(fixture.eventId))?.closedAt;

    await expect(closeCurrentVotingRound(fixture.eventId)).resolves.toEqual({
      ok: false,
      reason: "not-open",
    });
    await expect(
      readCurrentVotingRound(fixture.eventId),
    ).resolves.toMatchObject({ closedAt });
  });

  test("closes only the round it names: a late close of round 1 leaves the Desempate open", async () => {
    const fixture = await seedResultFixture();
    const roundOne = await readCurrentVotingRound(fixture.eventId);
    await fixture.vote(fixture.alas, { voters: 1 });
    await fixture.vote(fixture.ritmo, { voters: 1 });
    await closeVotingRound({
      eventId: fixture.eventId,
      roundId: roundOne?.id ?? "",
    });
    await openTieBreakRound({ eventId: fixture.eventId });

    await expect(
      closeVotingRound({
        eventId: fixture.eventId,
        roundId: roundOne?.id ?? "",
      }),
    ).resolves.toEqual({ ok: false, reason: "not-open" });
    await expect(
      readCurrentVotingRound(fixture.eventId),
    ).resolves.toMatchObject({ closedAt: null, number: 2 });
  });
});

describe("`openTieBreakRound`", () => {
  test("opens round 2 over the academies tied for first place only, with their round 1 banners", async () => {
    const fixture = await seedTiedRoundFixture();
    const roundOne = await readCurrentVotingRound(fixture.eventId);

    await expect(
      openTieBreakRound({ eventId: fixture.eventId }),
    ).resolves.toEqual({ number: 2, ok: true });

    const roundTwo = await readCurrentVotingRound(fixture.eventId);
    expect(roundTwo).toMatchObject({ closedAt: null, number: 2 });
    expect(roundTwo?.id).not.toBe(roundOne?.id);
    expect(roundTwo?.finalists).toEqual(
      roundOne?.finalists.filter(
        (finalist) => finalist.academyId !== fixture.sol,
      ),
    );
  });

  test("keeps round 1's votes and lets its codes vote again", async () => {
    const fixture = await seedTiedRoundFixture();
    const roundOne = await readCurrentVotingRound(fixture.eventId);
    await openTieBreakRound({ eventId: fixture.eventId });
    const roundTwo = await readCurrentVotingRound(fixture.eventId);

    await expect(
      castVote({
        academyId: fixture.ritmo,
        identity: { kind: "code", token: fixture.tokens[0] },
        roundId: roundTwo?.id ?? "",
      }),
    ).resolves.toEqual({ ok: true });
    await expect(
      castVote({
        academyId: fixture.sol,
        identity: { kind: "code", token: fixture.tokens[1] },
        roundId: roundTwo?.id ?? "",
      }),
    ).resolves.toEqual({ ok: false, reason: "not-finalist" });

    const roundOneVotes = await db
      .select({ id: votes.id })
      .from(votes)
      .where(eq(votes.roundId, roundOne?.id ?? ""));
    expect(roundOneVotes).toHaveLength(15);
  });

  test("is refused before round 1 opens, while it is open, and after it closed with one winner", async () => {
    const fixture = await seedResultFixture();

    await expect(
      openTieBreakRound({ eventId: crypto.randomUUID() }),
    ).resolves.toEqual({ ok: false, reasons: ["no-round"] });
    await expect(
      openTieBreakRound({ eventId: fixture.eventId }),
    ).resolves.toEqual({ ok: false, reasons: ["round-open"] });

    await fixture.vote(fixture.alas, { voters: 1 });
    await closeCurrentVotingRound(fixture.eventId);

    await expect(
      openTieBreakRound({ eventId: fixture.eventId }),
    ).resolves.toEqual({ ok: false, reasons: ["no-tie"] });
  });

  test("is refused once the Desempate opened, and after it closed tied too", async () => {
    const fixture = await seedTiedRoundFixture();
    await openTieBreakRound({ eventId: fixture.eventId });

    await expect(
      openTieBreakRound({ eventId: fixture.eventId }),
    ).resolves.toEqual({
      ok: false,
      reasons: ["round-open", "already-tie-break"],
    });

    await closeCurrentVotingRound(fixture.eventId);

    await expect(
      openTieBreakRound({ eventId: fixture.eventId }),
    ).resolves.toEqual({ ok: false, reasons: ["already-tie-break"] });
  });

  test("opens one round when asked twice at once", async () => {
    const fixture = await seedTiedRoundFixture();

    const results = await Promise.all([
      openTieBreakRound({ eventId: fixture.eventId }),
      openTieBreakRound({ eventId: fixture.eventId }),
    ]);

    expect(results).toEqual(
      expect.arrayContaining([
        { number: 2, ok: true },
        { ok: false, reasons: ["round-open", "already-tie-break"] },
      ]),
    );
  });
});

/**
 * An open that starts while a banner save of a finalist is still writing
 * waits for it, and copies the key the save wrote: the save deletes the one
 * it replaced as soon as it commits. A single PGlite connection serialises
 * transactions on its own, so this runs on Postgres only.
 */
describe.skipIf(isPgliteTestBackend())(
  "`openVotingRound` behind a banner save",
  () => {
    test("copies the banner the save wrote, not the one it replaced", async () => {
      const fixture = await seedFinalistsFixture();
      const alas = await fixture.addFinalist("Alas");
      const newKey = `banners/${alas}/first-new.jpg`;

      const opened = await runBehindAHolder({
        waitingOn: "banner row",
        hold: (tx) =>
          tx
            .update(finalistBanners)
            .set({ firstStorageKey: newKey })
            .where(
              and(
                eq(finalistBanners.eventId, fixture.eventId),
                eq(finalistBanners.academyId, alas),
              ),
            ),
        contender: () => openVotingRound({ eventId: fixture.eventId }),
      });

      expect(opened).toEqual({ number: 1, ok: true });
      const round = await readCurrentVotingRound(fixture.eventId);
      expect(round?.finalists[0]?.keys.first).toBe(newKey);
    });
  },
);
