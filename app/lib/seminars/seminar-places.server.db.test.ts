import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { seminarInscriptions, seminars } from "@/db/schema";
import { createDancer } from "@/lib/choreographies/registration.test-support";
import { createSeminarRegistrationPrices } from "@/lib/seminar-prices/seminar-prices.test-support";
import { createSeminar } from "@/lib/seminars/repository.server";
import {
  checkSeminarCrossings,
  checkSeminarQuota,
  grantSeminarReservation,
  losesSeminarPlace,
  readSeminarPlaceLedgers,
  readSeminarRowsCoverage,
} from "@/lib/seminars/seminar-places.server";
import { coverSeminarInscriptionDeposit } from "@/lib/seminars/seminars.test-support";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSavedEvent, eventDates } from "@/lib/test-support/events";
import { defaultSeminarFacts } from "@/lib/test-support/seminars";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

// The seminar starts 2030-10-10 18:30 in business time (21:30 UTC); every
// reading below is taken at a fixed instant before it.
const now = new Date("2030-10-01T12:00:00.000Z");
const hour = 60 * 60 * 1000;

async function createSeminarFixture(quota: number) {
  const event = await createSavedEvent({
    name: "Regional 2030",
    active: false,
    ...eventDates(2030),
  });
  const seminar = await createSeminar(event.id, {
    instructorName: "Abril Sosa",
    scheduledDate: "2030-10-10",
    startTime: "18:30",
    quota,
    ...defaultSeminarFacts,
  });

  if (!seminar.ok) {
    throw new Error(`Expected the seminar to be saved: ${seminar.error}`);
  }

  await createSeminarRegistrationPrices(event.id);

  const { academy } = await createAcademyUser({
    academyName: "Academia Lugar",
    email: `${crypto.randomUUID()}@example.com`,
  });

  return { academyId: academy.id, eventId: event.id, seminar: seminar.seminar };
}

/** One inscription of a fresh dancer, stored with `reservedUntil` as given:
 * a row inserted this way is in exactly the state the test names. */
async function insertInscription(
  fixture: Awaited<ReturnType<typeof createSeminarFixture>>,
  reservedUntil: Date | null = null,
) {
  const dancer = await createDancer(fixture.academyId, {
    documentNumber: crypto.randomUUID().slice(0, 8),
  });
  const [row] = await db
    .insert(seminarInscriptions)
    .values({
      dancerId: dancer.id,
      reservedUntil,
      seminarId: fixture.seminar.id,
    })
    .returning({ id: seminarInscriptions.id });

  if (!row) {
    throw new Error("Expected the seminar inscription to be inserted.");
  }

  return row.id;
}

async function insertCoveredInscription(
  fixture: Awaited<ReturnType<typeof createSeminarFixture>>,
) {
  const inscriptionId = await insertInscription(fixture);

  await coverSeminarInscriptionDeposit({
    academyId: fixture.academyId,
    eventId: fixture.eventId,
    inscriptionId,
    seminarId: fixture.seminar.id,
  });

  return inscriptionId;
}

async function readLedger(seminarId: string, at: Date = now) {
  const ledger = (
    await readSeminarPlaceLedgers(db, { now: at, seminarIds: [seminarId] })
  ).get(seminarId);

  if (!ledger) {
    throw new Error(`Expected a ledger for seminar ${seminarId}.`);
  }

  return ledger;
}

describe("readSeminarPlaceLedgers", () => {
  test("reads who holds each place: a covered row for good, a live reservation for now, and nobody else", async () => {
    const fixture = await createSeminarFixture(10);
    const covered = await insertCoveredInscription(fixture);
    const reserved = await insertInscription(
      fixture,
      new Date(now.getTime() + 24 * hour),
    );
    const lapsed = await insertInscription(
      fixture,
      new Date(now.getTime() - hour),
    );
    const unreserved = await insertInscription(fixture);

    const ledger = await readLedger(fixture.seminar.id);

    expect({
      covered: ledger.holdingOf(covered),
      lapsed: ledger.holdingOf(lapsed),
      reserved: ledger.holdingOf(reserved),
      unreserved: ledger.holdingOf(unreserved),
    }).toEqual({
      covered: "covered",
      lapsed: "none",
      reserved: "reserved",
      unreserved: "none",
    });
    expect({
      availablePlaces: ledger.availablePlaces,
      coveredCount: ledger.coveredCount,
      isFull: ledger.isFull,
      reservedCount: ledger.reservedCount,
    }).toEqual({
      availablePlaces: 8,
      coveredCount: 1,
      isFull: false,
      reservedCount: 1,
    });
  });

  test("leaves a withdrawn row out, covered or reserved, so withdrawing frees its place", async () => {
    const fixture = await createSeminarFixture(2);
    const covered = await insertCoveredInscription(fixture);
    const reserved = await insertInscription(
      fixture,
      new Date(now.getTime() + 24 * hour),
    );

    await db
      .update(seminarInscriptions)
      .set({ withdrawnAt: now })
      .where(eq(seminarInscriptions.seminarId, fixture.seminar.id));

    const ledger = await readLedger(fixture.seminar.id);

    expect(ledger.holdingOf(covered)).toBeUndefined();
    expect(ledger.holdingOf(reserved)).toBeUndefined();
    expect(ledger.availablePlaces).toBe(2);
  });

  test("ends a reservation at the instant it is read past, without anything being written", async () => {
    const fixture = await createSeminarFixture(1);
    const reservedUntil = new Date(now.getTime() + 2 * hour);
    const reserved = await insertInscription(fixture, reservedUntil);

    const before = await readLedger(
      fixture.seminar.id,
      new Date(reservedUntil.getTime() - 1),
    );
    const after = await readLedger(fixture.seminar.id, reservedUntil);

    expect([before.holdingOf(reserved), before.isFull]).toEqual([
      "reserved",
      true,
    ]);
    expect([after.holdingOf(reserved), after.isFull]).toEqual(["none", false]);
  });

  test("ends a reservation when its seminar was moved earlier and has started", async () => {
    const fixture = await createSeminarFixture(1);
    const reserved = await insertInscription(
      fixture,
      new Date(now.getTime() + 72 * hour),
    );

    // Moved to the morning of the reading's day: 2030-10-01 08:00 business
    // time is 11:00 UTC, an hour before `now`.
    await db
      .update(seminars)
      .set({ scheduledDate: "2030-10-01", startTime: "08:00" })
      .where(eq(seminars.id, fixture.seminar.id));

    expect((await readLedger(fixture.seminar.id)).holdingOf(reserved)).toBe(
      "none",
    );
  });

  test("is full exactly when covered and reserved rows reach the quota", async () => {
    const fixture = await createSeminarFixture(2);

    await insertCoveredInscription(fixture);
    expect((await readLedger(fixture.seminar.id)).isFull).toBe(false);

    await insertInscription(fixture, new Date(now.getTime() + hour));
    const full = await readLedger(fixture.seminar.id);

    expect([full.availablePlaces, full.isFull]).toEqual([0, true]);
  });

  test("never reads fewer than zero places when the quota sits under the places taken", async () => {
    const fixture = await createSeminarFixture(2);

    await insertCoveredInscription(fixture);
    await insertCoveredInscription(fixture);
    await db
      .update(seminars)
      .set({ quota: 1 })
      .where(eq(seminars.id, fixture.seminar.id));

    const ledger = await readLedger(fixture.seminar.id);

    expect([ledger.availablePlaces, ledger.isFull]).toEqual([0, true]);
  });

  test("answers a seminar nobody registered into with its whole quota free", async () => {
    const fixture = await createSeminarFixture(5);

    const ledger = await readLedger(fixture.seminar.id);

    expect({
      availablePlaces: ledger.availablePlaces,
      coveredCount: ledger.coveredCount,
      reservedCount: ledger.reservedCount,
    }).toEqual({ availablePlaces: 5, coveredCount: 0, reservedCount: 0 });
  });
});

describe("a ledger's answer for a write that crosses deposits", () => {
  test("never lets a row's own reservation block its deposit", async () => {
    const fixture = await createSeminarFixture(1);
    const reserved = await insertInscription(
      fixture,
      new Date(now.getTime() + hour),
    );

    const ledger = await readLedger(fixture.seminar.id);

    expect(ledger.isFull).toBe(true);
    expect(ledger.shortfallFor([reserved])).toBe(0);
    expect(ledger.placesLeftFor([reserved])).toBe(1);
  });

  test("never counts a covered row against its own crossing", async () => {
    const fixture = await createSeminarFixture(1);
    const covered = await insertCoveredInscription(fixture);

    expect((await readLedger(fixture.seminar.id)).shortfallFor([covered])).toBe(
      0,
    );
  });

  test("counts the places other rows hold, covered and reserved, against the crossings", async () => {
    const fixture = await createSeminarFixture(3);

    await insertCoveredInscription(fixture);
    await insertInscription(fixture, new Date(now.getTime() + hour));
    const first = await insertInscription(fixture);
    const second = await insertInscription(fixture);

    const ledger = await readLedger(fixture.seminar.id);

    expect(ledger.placesLeftFor([first, second])).toBe(1);
    expect(ledger.shortfallFor([first, second])).toBe(1);
    expect(ledger.shortfallFor([first])).toBe(0);
  });
});

describe("checkSeminarCrossings", () => {
  test("refuses the whole write, naming each seminar short and by how many places", async () => {
    const full = await createSeminarFixture(1);
    const roomy = await createSeminarFixture(3);

    await insertCoveredInscription(full);
    const blocked = await insertInscription(full);
    const fits = [
      await insertInscription(roomy),
      await insertInscription(roomy),
    ];

    const check = await db.transaction((tx) =>
      checkSeminarCrossings(tx, {
        crossingIdsBySeminarId: new Map([
          [full.seminar.id, [blocked]],
          [roomy.seminar.id, fits],
        ]),
        now,
      }),
    );

    expect(check).toEqual({
      ok: false,
      reason: "no-places",
      shortfalls: [{ seminarId: full.seminar.id, shortBy: 1 }],
    });
  });

  test("lets a write through when every crossing fits", async () => {
    const fixture = await createSeminarFixture(2);
    const reserved = await insertInscription(
      fixture,
      new Date(now.getTime() + hour),
    );
    const other = await insertInscription(fixture);

    await expect(
      db.transaction((tx) =>
        checkSeminarCrossings(tx, {
          crossingIdsBySeminarId: new Map([
            [fixture.seminar.id, [reserved, other]],
          ]),
          now,
        }),
      ),
    ).resolves.toEqual({ ok: true });
  });
});

describe("grantSeminarReservation", () => {
  test("reserves a free place for 72 hours", async () => {
    const fixture = await createSeminarFixture(1);

    await expect(
      db.transaction((tx) =>
        grantSeminarReservation(tx, { now, seminarId: fixture.seminar.id }),
      ),
    ).resolves.toEqual(new Date(now.getTime() + 72 * hour));
  });

  test("never reserves past the seminar's start", async () => {
    const fixture = await createSeminarFixture(1);
    const dayBefore = new Date("2030-10-09T21:30:00.000Z");

    await expect(
      db.transaction((tx) =>
        grantSeminarReservation(tx, {
          now: dayBefore,
          seminarId: fixture.seminar.id,
        }),
      ),
    ).resolves.toEqual(new Date("2030-10-10T21:30:00.000Z"));
  });

  test("reserves nothing in a seminar whose places are held", async () => {
    const fixture = await createSeminarFixture(2);

    await insertCoveredInscription(fixture);
    await insertInscription(fixture, new Date(now.getTime() + hour));

    await expect(
      db.transaction((tx) =>
        grantSeminarReservation(tx, { now, seminarId: fixture.seminar.id }),
      ),
    ).resolves.toBeNull();
  });
});

describe("checkSeminarQuota", () => {
  test("holds the quota at the covered count, which a reservation does not raise", async () => {
    const fixture = await createSeminarFixture(5);

    await insertCoveredInscription(fixture);
    await insertCoveredInscription(fixture);
    await insertInscription(fixture, new Date(now.getTime() + hour));

    const check = (quota: number) =>
      db.transaction((tx) =>
        checkSeminarQuota(tx, { quota, seminarId: fixture.seminar.id }),
      );

    await expect(check(2)).resolves.toEqual({ ok: true });
    await expect(check(1)).resolves.toEqual({
      ok: false,
      reason: "below-covered",
      floor: 2,
    });
  });
});

describe("losesSeminarPlace", () => {
  test("is a loss only when the money leaving drops a covered row below its deposit", async () => {
    const fixture = await createSeminarFixture(3);
    const covered = await insertCoveredInscription(fixture);
    const uncovered = await insertInscription(fixture);
    const coverage = await readSeminarRowsCoverage(db, [covered, uncovered]);
    const coveredRow = coverage.get(covered);
    const uncoveredRow = coverage.get(uncovered);

    if (!coveredRow || !uncoveredRow) {
      throw new Error("Expected both rows to be read.");
    }

    expect(losesSeminarPlace({ coverage: coveredRow, releasedAmount: 1 })).toBe(
      true,
    );
    expect(losesSeminarPlace({ coverage: coveredRow, releasedAmount: 0 })).toBe(
      false,
    );
    expect(
      losesSeminarPlace({ coverage: uncoveredRow, releasedAmount: 0 }),
    ).toBe(false);
  });

  test("never counts a withdrawn row as losing a place, whatever money it held", async () => {
    const fixture = await createSeminarFixture(3);
    const covered = await insertCoveredInscription(fixture);

    await db
      .update(seminarInscriptions)
      .set({ withdrawnAt: now })
      .where(eq(seminarInscriptions.id, covered));

    const coverage = (await readSeminarRowsCoverage(db, [covered])).get(
      covered,
    );

    if (!coverage) {
      throw new Error("Expected the withdrawn row to be read.");
    }

    expect(coverage.withdrawn).toBe(true);
    expect(
      losesSeminarPlace({ coverage, releasedAmount: coverage.allocatedAmount }),
    ).toBe(false);
  });
});
