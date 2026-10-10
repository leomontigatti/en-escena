import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { scores } from "@/db/schema";
import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";

import {
  handlePresentationListAction,
  loadPresentationListRouteData,
} from "./server";
import { orderAutomaticallyIntent, orderDayFieldName } from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const listUrl = "http://localhost/administracion/presentaciones";

async function orderAutomatically(days: string[]) {
  const body = new FormData();
  body.set("intent", orderAutomaticallyIntent);

  for (const day of days) {
    body.append(orderDayFieldName, day);
  }

  const { request } = await createSignedInAdminRequest({
    body,
    email: `${crypto.randomUUID()}@example.com`,
    requestUrl: listUrl,
    role: "admin",
  });

  return await handlePresentationListAction(request);
}

async function loadList() {
  const { request } = await createSignedInAdminRequest({
    email: `${crypto.randomUUID()}@example.com`,
    requestUrl: listUrl,
    role: "admin",
  });

  return await loadPresentationListRouteData(request);
}

/**
 * The route adapter of the ordering by day: which days the submission names,
 * and which days the list says hold a frozen row. How a day is ordered is
 * `ordering.test.ts`'s.
 */
describe("ordering the participation list by day", () => {
  test("orders the chosen day and leaves the manual order of the others", async () => {
    const fixture = await seedJudgingFixture();
    const placedSecond = await fixture.addPresentation({
      name: "Puesta segunda",
      orderNumber: 2,
      scheduledDate: "2026-12-04",
    });
    const placedFirst = await fixture.addPresentation({
      name: "Puesta primera",
      orderNumber: 1,
      scheduledDate: "2026-12-04",
    });
    await fixture.addPresentation({
      name: "Del sábado",
      orderNumber: 3,
      scheduledDate: "2026-12-05",
    });

    const result = await orderAutomatically(["2026-12-05"]);

    expect(result).toEqual({
      message: "Se ordenó 1 presentación.",
      status: "success",
    });

    const list = await loadList();
    const numberOf = (choreographyId: string) =>
      list.presentations.find((row) => row.id === choreographyId)?.orderNumber;

    expect(numberOf(placedFirst.choreographyId)).toBe(1);
    expect(numberOf(placedSecond.choreographyId)).toBe(2);
  });

  test("refuses a day the event has no schedule on", async () => {
    const fixture = await seedJudgingFixture();
    const placed = await fixture.addPresentation({
      name: "Una",
      orderNumber: 5,
      scheduledDate: "2026-12-04",
    });

    const result = await orderAutomatically(["2026-12-04", "2027-01-01"]);

    expect(result).toMatchObject({
      data: { status: "error" },
      init: { status: 400 },
    });
    expect(
      (await loadList()).presentations.find(
        (row) => row.id === placed.choreographyId,
      )?.orderNumber,
    ).toBe(5);
  });

  test("names the days that hold a frozen presentation", async () => {
    const fixture = await seedJudgingFixture();
    const scored = await fixture.addPresentation({
      name: "Evaluada",
      orderNumber: 1,
      scheduledDate: "2026-12-04",
    });
    await fixture.addPresentation({
      name: "Pendiente",
      orderNumber: 2,
      scheduledDate: "2026-12-05",
    });
    const { judgeAssignmentId } = await fixture.assignJudge(
      scored.presentationId,
    );
    await db.insert(scores).values({ judgeAssignmentId, value: "90" });

    expect((await loadList()).frozenDays).toEqual(["2026-12-04"]);
  });
});
