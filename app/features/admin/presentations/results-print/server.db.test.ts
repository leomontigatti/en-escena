import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographies, presentations, schedules, scores } from "@/db/schema";
import {
  createDancer,
  createSelectedPriceInscriptionForTest,
} from "@/features/portal/choreographies/test-support/db";
import { createInactiveEvent } from "@/lib/admin/finances/finances.test-support";
import {
  createSignedInAdminRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";

import { loadResultsPrint, resultsPrintScheduleParam } from "./server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const printUrl =
  "http://localhost/administracion/presentaciones/resultados/imprimir";

async function signedInRequest(
  scheduleIds: string[],
  role: "academy" | "admin" | "auditor" = "admin",
) {
  const url = new URL(printUrl);

  for (const scheduleId of scheduleIds) {
    url.searchParams.append(resultsPrintScheduleParam, scheduleId);
  }

  const { request } = await createSignedInAdminRequest({
    email: `${crypto.randomUUID()}@example.com`,
    requestUrl: url.toString(),
    role,
  });

  return request;
}

async function scorePresentation(
  fixture: Awaited<ReturnType<typeof seedJudgingFixture>>,
  presentationId: string,
  values: string[],
) {
  for (const value of values) {
    const { judgeAssignmentId } = await fixture.assignJudge(presentationId);

    await db.insert(scores).values({ judgeAssignmentId, value });
  }
}

async function scheduleOf(choreographyId: string) {
  const [row] = await db
    .select({ scheduleId: choreographies.scheduleId })
    .from(choreographies)
    .where(eq(choreographies.id, choreographyId));

  return row.scheduleId;
}

describe("the results print", () => {
  test("prints only the chosen schedules, in day and time order", async () => {
    const fixture = await seedJudgingFixture();
    const first = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
      scheduledDate: "2026-05-01",
    });
    const second = await fixture.addPresentation({
      name: "Segunda",
      orderNumber: 2,
      scheduledDate: "2026-05-02",
    });
    const outside = await fixture.addPresentation({
      name: "Fuera",
      orderNumber: 3,
      scheduledDate: "2026-05-03",
    });
    for (const { presentationId } of [first, second, outside]) {
      await scorePresentation(fixture, presentationId, ["80.0"]);
    }
    const firstSchedule = await scheduleOf(first.choreographyId);
    const secondSchedule = await scheduleOf(second.choreographyId);

    const print = await loadResultsPrint(
      await signedInRequest([secondSchedule, firstSchedule]),
    );

    expect(print.eventName).toBe(fixture.event.name);
    expect(print.schedules.map((schedule) => schedule.id)).toEqual([
      firstSchedule,
      secondSchedule,
    ]);
    expect(print.rows.map((row) => row.name)).toEqual(["Primera", "Segunda"]);
  });

  test("answers not found for a schedule outside the selected event", async () => {
    const fixture = await seedJudgingFixture();
    const inside = await fixture.addPresentation({
      name: "Adentro",
      orderNumber: 1,
    });
    const otherEvent = await createInactiveEvent("Otro evento");
    const [outside] = await db
      .insert(schedules)
      .values({
        eventId: otherEvent.id,
        name: "Ajeno",
        scheduledDate: "2025-05-01",
        startTime: "10:00",
        totalCapacity: 10,
      })
      .returning();

    await expectThrownResponse(
      loadResultsPrint(
        await signedInRequest([
          await scheduleOf(inside.choreographyId),
          outside.id,
        ]),
      ),
      404,
    );
    await expectThrownResponse(
      loadResultsPrint(await signedInRequest([])),
      404,
    );
  });

  test("turns away everyone but an administrator", async () => {
    await seedJudgingFixture();

    for (const role of ["academy", "auditor"] as const) {
      await expectThrownResponse(
        loadResultsPrint(await signedInRequest([], role)),
        403,
      );
    }
  });

  test("reads the live average and award, and leaves out what has none", async () => {
    const fixture = await seedJudgingFixture();
    const gold = await fixture.addPresentation({ name: "Oro", orderNumber: 1 });
    const bronze = await fixture.addPresentation({
      name: "Bronce",
      orderNumber: 2,
    });
    await fixture.addPresentation({ name: "Pendiente", orderNumber: 3 });
    const disqualified = await fixture.addPresentation({
      name: "Descalificada",
      orderNumber: 4,
    });
    await scorePresentation(fixture, gold.presentationId, ["92.0", "95.5"]);
    await scorePresentation(fixture, bronze.presentationId, ["61.0", "62.5"]);
    await scorePresentation(fixture, disqualified.presentationId, ["99.0"]);
    await db
      .update(presentations)
      .set({ disqualifiedAt: new Date() })
      .where(eq(presentations.id, disqualified.presentationId));

    const print = await loadResultsPrint(
      await signedInRequest([await scheduleOf(gold.choreographyId)]),
    );

    // Nothing is published: the print reads the results live all the same.
    expect(
      print.rows.map(({ average, award, name }) => ({ average, award, name })),
    ).toEqual([
      { average: 93.75, award: "gold", name: "Oro" },
      { average: 61.75, award: "bronze", name: "Bronce" },
    ]);
  });

  test("prints no page for a schedule left with nothing to print", async () => {
    const fixture = await seedJudgingFixture();
    const scored = await fixture.addPresentation({
      name: "Con puntaje",
      orderNumber: 1,
      scheduledDate: "2026-05-01",
    });
    const pending = await fixture.addPresentation({
      name: "Pendiente",
      orderNumber: 2,
      scheduledDate: "2026-05-02",
    });
    await scorePresentation(fixture, scored.presentationId, ["75.0"]);
    const scoredSchedule = await scheduleOf(scored.choreographyId);

    const print = await loadResultsPrint(
      await signedInRequest([
        scoredSchedule,
        await scheduleOf(pending.choreographyId),
      ]),
    );

    expect(print.schedules.map((schedule) => schedule.id)).toEqual([
      scoredSchedule,
    ]);
  });

  test("names the dancer of a solo, and of no other group type", async () => {
    const fixture = await seedJudgingFixture();
    const solo = await fixture.addPresentation({
      name: "Solo",
      orderNumber: 1,
    });
    const duo = await fixture.addPresentation({ name: "Dúo", orderNumber: 2 });
    const trio = await fixture.addPresentation({
      name: "Trío",
      orderNumber: 3,
    });

    for (const [presentation, groupType, extraDancers] of [
      [duo, "duo", ["Bea"]],
      [trio, "trio", ["Bea", "Cata"]],
    ] as const) {
      await db
        .update(choreographies)
        .set({ groupType })
        .where(eq(choreographies.id, presentation.choreographyId));

      for (const firstName of extraDancers) {
        const dancer = await createDancer(fixture.academy.academy.id, {
          firstName,
        });

        await createSelectedPriceInscriptionForTest({
          academyId: fixture.academy.academy.id,
          choreographyId: presentation.choreographyId,
          dancerId: dancer.id,
        });
      }
    }

    for (const { presentationId } of [solo, duo, trio]) {
      await scorePresentation(fixture, presentationId, ["80.0"]);
    }

    const print = await loadResultsPrint(
      await signedInRequest([await scheduleOf(solo.choreographyId)]),
    );

    expect(print.rows.map((row) => row.dancerNames.length)).toEqual([1, 0, 0]);
  });
});
