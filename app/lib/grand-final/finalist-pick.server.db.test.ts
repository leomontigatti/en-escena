import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { finalistPicks, user } from "@/db/schema";
import {
  readJudgeFinalistPicks,
  saveFinalistPick,
  setFinalistPick,
} from "@/lib/grand-final/finalist-pick.server";
import { seedEligibilityFixture } from "@/lib/grand-final/grand-final.test-support";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

const showDay = "2026-10-23";
// Noon of the show day in Buenos Aires, and the two sides of the 03:00 close
// the next morning.
const duringTheShow = new Date("2026-10-23T15:00:00Z");
const pastMidnight = new Date("2026-10-24T05:30:00Z");
const afterTheClose = new Date("2026-10-24T06:30:00Z");
const theDayBefore = new Date("2026-10-22T15:00:00Z");

/**
 * Jazz dances on the show day, and two academies are eligible in it: the
 * smallest panel a pick can choose within.
 */
async function seedJazzDay() {
  const fixture = await seedEligibilityFixture();
  const jazz = await fixture.addModality("Jazz");
  const pirueta = await fixture.addAcademy("Academia Pirueta");
  const vecina = await fixture.addAcademy("Academia Vecina");

  for (const academy of [pirueta, vecina]) {
    await fixture.register({ academy, modality: jazz, category: "Infantil" });
    await fixture.register({ academy, modality: jazz, category: "Mayores" });
  }

  await fixture.danceOn(jazz, showDay);

  return { fixture, jazz, pirueta, vecina };
}

async function readPick(judgeId: string, modalityId: string) {
  const rows = await readJudgeFinalistPicks({
    judgeId,
    scheduledDate: showDay,
  });

  return rows.find((row) => row.modalityId === modalityId)?.academyId ?? null;
}

describe("`saveFinalistPick`", () => {
  test("saves the judge's pick of an eligible academy on the modality's day", async () => {
    const { fixture, jazz, pirueta } = await seedJazzDay();
    const judgeId = await fixture.addJudge();

    await expect(
      saveFinalistPick({
        academyId: pirueta,
        judgeId,
        modalityId: jazz,
        now: duringTheShow,
      }),
    ).resolves.toEqual({ ok: true });
    await expect(readPick(judgeId, jazz)).resolves.toBe(pirueta);
  });

  test("a second save replaces the pick rather than adding one", async () => {
    const { fixture, jazz, pirueta, vecina } = await seedJazzDay();
    const judgeId = await fixture.addJudge();

    for (const academyId of [pirueta, vecina]) {
      await saveFinalistPick({
        academyId,
        judgeId,
        modalityId: jazz,
        now: duringTheShow,
      });
    }

    await expect(readPick(judgeId, jazz)).resolves.toBe(vecina);
    await expect(db.$count(finalistPicks)).resolves.toBe(1);
  });

  test("judges pick independently", async () => {
    const { fixture, jazz, pirueta, vecina } = await seedJazzDay();
    const ana = await fixture.addJudge("Ana Juez");
    const bruno = await fixture.addJudge("Bruno Juez");

    await saveFinalistPick({
      academyId: pirueta,
      judgeId: ana,
      modalityId: jazz,
      now: duringTheShow,
    });
    await saveFinalistPick({
      academyId: vecina,
      judgeId: bruno,
      modalityId: jazz,
      now: duringTheShow,
    });

    await expect(readPick(ana, jazz)).resolves.toBe(pirueta);
    await expect(readPick(bruno, jazz)).resolves.toBe(vecina);
  });

  test("stays open past midnight until 03:00, like a score", async () => {
    const { fixture, jazz, pirueta } = await seedJazzDay();
    const judgeId = await fixture.addJudge();

    await expect(
      saveFinalistPick({
        academyId: pirueta,
        judgeId,
        modalityId: jazz,
        now: pastMidnight,
      }),
    ).resolves.toEqual({ ok: true });
  });

  test.each([
    ["after 03:00 the next morning", afterTheClose, "closed"],
    ["before the modality's day", theDayBefore, "not-started"],
  ])("refuses a save %s", async (_when, now, reason) => {
    const { fixture, jazz, pirueta } = await seedJazzDay();
    const judgeId = await fixture.addJudge();

    await expect(
      saveFinalistPick({ academyId: pirueta, judgeId, modalityId: jazz, now }),
    ).resolves.toEqual({ ok: false, reason });
    await expect(readPick(judgeId, jazz)).resolves.toBeNull();
  });

  test("refuses an academy that is not eligible in that modality, even one eligible in another", async () => {
    const { fixture, jazz, pirueta } = await seedJazzDay();
    const judgeId = await fixture.addJudge();
    const tap = await fixture.addModality("Tap");
    const tapOnly = await fixture.addAcademy("Academia Tap");

    await fixture.register({
      academy: tapOnly,
      modality: tap,
      category: "Infantil",
    });
    await fixture.register({
      academy: tapOnly,
      modality: tap,
      category: "Mayores",
    });
    await fixture.register({
      academy: tapOnly,
      modality: jazz,
      category: "Infantil",
    });
    await saveFinalistPick({
      academyId: pirueta,
      judgeId,
      modalityId: jazz,
      now: duringTheShow,
    });

    await expect(
      saveFinalistPick({
        academyId: tapOnly,
        judgeId,
        modalityId: jazz,
        now: duringTheShow,
      }),
    ).resolves.toEqual({ ok: false, reason: "not-eligible" });
    await expect(readPick(judgeId, jazz)).resolves.toBe(pirueta);
  });

  test("refuses a modality outside the active event", async () => {
    const { fixture, pirueta } = await seedJazzDay();
    const judgeId = await fixture.addJudge();

    await expect(
      saveFinalistPick({
        academyId: pirueta,
        judgeId,
        modalityId: crypto.randomUUID(),
        now: duringTheShow,
      }),
    ).resolves.toEqual({ ok: false, reason: "not-found" });
  });
});

describe("`setFinalistPick`", () => {
  test("administration changes a judge's pick on the same row, long after the day closed", async () => {
    const { fixture, jazz, pirueta, vecina } = await seedJazzDay();
    const judgeId = await fixture.addJudge();

    await saveFinalistPick({
      academyId: pirueta,
      judgeId,
      modalityId: jazz,
      now: duringTheShow,
    });

    await expect(
      setFinalistPick({ academyId: vecina, judgeId, modalityId: jazz }),
    ).resolves.toEqual({ ok: true });
    await expect(readPick(judgeId, jazz)).resolves.toBe(vecina);
    await expect(db.$count(finalistPicks)).resolves.toBe(1);
  });

  test("sets a pick for a judge who has none, before the modality's day", async () => {
    const { fixture, jazz, pirueta } = await seedJazzDay();
    const judgeId = await fixture.addJudge();

    await expect(
      setFinalistPick({ academyId: pirueta, judgeId, modalityId: jazz }),
    ).resolves.toEqual({ ok: true });
    await expect(readPick(judgeId, jazz)).resolves.toBe(pirueta);
  });

  test("refuses an academy that is not eligible in that modality", async () => {
    const { fixture, jazz, pirueta } = await seedJazzDay();
    const judgeId = await fixture.addJudge();
    const halfway = await fixture.addAcademy("Academia Infantil");

    await fixture.register({
      academy: halfway,
      modality: jazz,
      category: "Infantil",
    });
    await setFinalistPick({ academyId: pirueta, judgeId, modalityId: jazz });

    await expect(
      setFinalistPick({ academyId: halfway, judgeId, modalityId: jazz }),
    ).resolves.toEqual({ ok: false, reason: "not-eligible" });
    await expect(readPick(judgeId, jazz)).resolves.toBe(pirueta);
  });

  test("refuses a user who is not a judge", async () => {
    const { jazz, pirueta } = await seedJazzDay();
    const [admin] = await db
      .insert(user)
      .values({ email: "admin@example.com", name: "Admin", role: "admin" })
      .returning();

    await expect(
      setFinalistPick({
        academyId: pirueta,
        judgeId: admin.id,
        modalityId: jazz,
      }),
    ).resolves.toEqual({ ok: false, reason: "not-found" });
    await expect(db.$count(finalistPicks)).resolves.toBe(0);
  });
});

describe("`readJudgeFinalistPicks`", () => {
  test("lists the modalities that dance on the day, each with the academies eligible in it and the judge's own pick", async () => {
    const { fixture, jazz, pirueta, vecina } = await seedJazzDay();
    const tap = await fixture.addModality("Tap");
    const ana = await fixture.addJudge("Ana Juez");
    const bruno = await fixture.addJudge("Bruno Juez");

    await fixture.register({
      academy: pirueta,
      modality: tap,
      category: "Baby",
    });
    await fixture.register({
      academy: pirueta,
      modality: tap,
      category: "Juvenil",
    });
    await fixture.danceOn(tap, "2026-10-24");
    await saveFinalistPick({
      academyId: vecina,
      judgeId: bruno,
      modalityId: jazz,
      now: duringTheShow,
    });

    await expect(
      readJudgeFinalistPicks({ judgeId: ana, scheduledDate: showDay }),
    ).resolves.toEqual([
      {
        academyId: null,
        academyName: null,
        modalityId: jazz,
        modalityName: "Jazz",
        options: [
          { academyId: pirueta, name: "Academia Pirueta" },
          { academyId: vecina, name: "Academia Vecina" },
        ],
      },
    ]);
  });

  test("keeps showing a pick whose academy stopped being eligible", async () => {
    const { fixture, jazz, pirueta, vecina } = await seedJazzDay();
    const judgeId = await fixture.addJudge();

    await saveFinalistPick({
      academyId: vecina,
      judgeId,
      modalityId: jazz,
      now: duringTheShow,
    });
    await fixture.withdrawAll(vecina);

    await expect(
      readJudgeFinalistPicks({ judgeId, scheduledDate: showDay }),
    ).resolves.toMatchObject([
      {
        academyId: vecina,
        academyName: "Academia Vecina",
        options: [{ academyId: pirueta, name: "Academia Pirueta" }],
      },
    ]);
  });
});
