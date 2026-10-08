import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { schedules, user } from "@/db/schema";
import {
  createAccessRequestCookie,
  createAccessUser,
} from "@/lib/auth/access-auth.test-support";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { judgingDate } from "@/lib/judging/judging-day";
import { expectThrownResponse } from "@/lib/test-support/http";
import { loader } from "@/routes/juzgamiento";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

import { loadJudgePanelRouteData } from "./server";

installDatabaseTestHooks();

async function signIn(role: "auditor" | "judge", name: string) {
  const email = `${crypto.randomUUID()}@example.com`;
  const signUp = await createAccessUser({
    email,
    name,
    password: "password-segura",
  });

  await db
    .update(user)
    .set({ emailVerified: true, internalUsername: "persona", name, role })
    .where(eq(user.id, signUp.response.user.id));

  const cookie = createAccessRequestCookie(signUp.headers);

  return {
    request: new Request("http://localhost/juzgamiento", {
      headers: { cookie },
    }),
    requestDay: (day: string) =>
      new Request(`http://localhost/juzgamiento?dia=${day}`, {
        headers: { cookie },
      }),
    userId: signUp.response.user.id,
  };
}

const pastDay = "2020-01-01";
const futureDay = "2099-01-01";

/**
 * A judge with one presentation on the judging day, one on a day long gone and
 * one on a day still to come.
 */
async function seedJudgeDays() {
  const judge = await signIn("judge", "Juana Juez");
  const fixture = await seedJudgingFixture();
  const today = await fixture.addPresentation({ name: "Hoy", orderNumber: 1 });
  const past = await fixture.addPresentation({
    name: "Pasada",
    orderNumber: 2,
    scheduledDate: pastDay,
  });
  const future = await fixture.addPresentation({
    name: "Futura",
    orderNumber: 3,
    scheduledDate: futureDay,
  });

  for (const presentation of [today, past, future]) {
    await fixture.assignJudge(presentation.presentationId, judge.userId);
  }

  await db
    .update(schedules)
    .set({ scheduledDate: judgingDate() })
    .where(eq(schedules.id, fixture.catalog.schedule.id));

  return { fixture, judge };
}

describe("the `/juzgamiento` route", () => {
  test("refuses a user who is not a judge", async () => {
    const auditor = await signIn("auditor", "Ariel Auditor");

    await expectThrownResponse(
      loader({
        request: auditor.request,
        params: {},
        context: {},
        url: new URL("http://localhost/juzgamiento"),
        pattern: "/juzgamiento",
      }),
      403,
    );
  });

  test("hands the signed-in judge today's presentations", async () => {
    const judge = await signIn("judge", "Juana Juez");
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });

    await fixture.assignJudge(presentation.presentationId, judge.userId);
    await db
      .update(schedules)
      .set({ scheduledDate: judgingDate() })
      .where(eq(schedules.id, fixture.catalog.schedule.id));

    const data = await loadJudgePanelRouteData(judge.request);

    expect(data.account.name).toBe("Juana Juez");
    expect(data.presentations).toMatchObject([
      { name: "Primera", orderNumber: 1, status: "pending" },
    ]);
  });

  test("opens on the judging day and offers every day the judge has presentations on", async () => {
    const { judge } = await seedJudgeDays();

    const data = await loadJudgePanelRouteData(judge.request);

    expect(data).toMatchObject({
      day: judgingDate(),
      dayOptions: [pastDay, judgingDate(), futureDay],
      isOpen: true,
    });
    expect(data.presentations.map((row) => row.name)).toEqual(["Hoy"]);
  });

  test.each([
    ["a past", pastDay, "Pasada"],
    ["a future", futureDay, "Futura"],
  ])("shows %s day the URL names, closed", async (_when, day, name) => {
    const { judge } = await seedJudgeDays();

    const data = await loadJudgePanelRouteData(judge.requestDay(day));

    expect(data).toMatchObject({ day, isOpen: false });
    expect(data.presentations.map((row) => row.name)).toEqual([name]);
  });

  test("falls back to the judging day for a day the judge has nothing on", async () => {
    const { judge } = await seedJudgeDays();

    for (const day of ["2020-01-02", "no-es-una-fecha"]) {
      const data = await loadJudgePanelRouteData(judge.requestDay(day));

      expect(data).toMatchObject({ day: judgingDate(), isOpen: true });
      expect(data.presentations.map((row) => row.name)).toEqual(["Hoy"]);
    }
  });

  test("offers no other day while the judging day is the judge's only one", async () => {
    const judge = await signIn("judge", "Juana Juez");
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Hoy",
      orderNumber: 1,
    });

    await fixture.assignJudge(presentation.presentationId, judge.userId);
    await db
      .update(schedules)
      .set({ scheduledDate: judgingDate() })
      .where(eq(schedules.id, fixture.catalog.schedule.id));

    await expect(loadJudgePanelRouteData(judge.request)).resolves.toMatchObject(
      { dayOptions: [] },
    );
  });

  test("reaches a judge's only show day from an empty judging day", async () => {
    const judge = await signIn("judge", "Juana Juez");
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Futura",
      orderNumber: 1,
      scheduledDate: futureDay,
    });

    await fixture.assignJudge(presentation.presentationId, judge.userId);

    const data = await loadJudgePanelRouteData(judge.request);

    expect(data).toMatchObject({
      day: judgingDate(),
      dayOptions: [futureDay],
      isOpen: true,
      presentations: [],
    });
  });

  test("carries the judge's finalist pick of each modality that dances on the day shown, open only on the judging day", async () => {
    const { fixture, judge } = await seedJudgeDays();
    const modality = {
      modalityId: fixture.catalog.modality.id,
      academyId: null,
    };

    await expect(loadJudgePanelRouteData(judge.request)).resolves.toMatchObject(
      { finalistPicks: [modality], isOpen: true },
    );
    await expect(
      loadJudgePanelRouteData(judge.requestDay(pastDay)),
    ).resolves.toMatchObject({ finalistPicks: [modality], isOpen: false });
  });
});
