import { describe, expect, test } from "vitest";

import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import {
  readVisibleProgramDays,
  setVisibleProgramDays,
} from "@/lib/presentations/program-visibility.server";

import {
  handlePresentationListAction,
  loadPresentationListRouteData,
} from "./server";
import {
  programEventIdFieldName,
  programVisibleDayFieldName,
  setProgramVisibilityIntent,
} from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const listUrl = "http://localhost/administracion/presentaciones";

async function setVisibility(input: { days: string[]; eventId: string }) {
  const body = new FormData();
  body.set("intent", setProgramVisibilityIntent);
  body.set(programEventIdFieldName, input.eventId);

  for (const day of input.days) {
    body.append(programVisibleDayFieldName, day);
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

describe("choosing the program's visible days from the participation list", () => {
  test("publishes the chosen days, and the list reads them back", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addPresentation({
      name: "Una",
      orderNumber: 1,
      scheduledDate: "2026-12-04",
    });
    await fixture.addPresentation({
      name: "Otra",
      orderNumber: 2,
      scheduledDate: "2026-12-05",
    });

    const result = await setVisibility({
      days: ["2026-12-05", "2026-12-04"],
      eventId: fixture.event.id,
    });

    expect(result).toEqual({
      message: "Programa visible de los días viernes 4/12 y sábado 5/12.",
      status: "success",
    });
    expect(await readVisibleProgramDays(fixture.event.id)).toEqual([
      "2026-12-04",
      "2026-12-05",
    ]);
    await expect(loadList()).resolves.toMatchObject({
      programVisibleDays: ["2026-12-04", "2026-12-05"],
    });
  });

  // The submission is the state asked for, not a flip: a day it leaves out is
  // hidden, and sending it again changes nothing.
  test("hides the days the submission leaves out, the same way every time", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addPresentation({
      name: "Una",
      orderNumber: 1,
      scheduledDate: "2026-12-05",
    });
    await setVisibleProgramDays(fixture.event.id, ["2026-12-04", "2026-12-05"]);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const result = await setVisibility({
        days: ["2026-12-05"],
        eventId: fixture.event.id,
      });

      expect(result).toEqual({
        message: "Programa visible del sábado 5/12.",
        status: "success",
      });
      expect(await readVisibleProgramDays(fixture.event.id)).toEqual([
        "2026-12-05",
      ]);
    }
  });

  test("hides the whole program when no day is sent", async () => {
    const fixture = await seedJudgingFixture();
    await setVisibleProgramDays(fixture.event.id, ["2026-12-04"]);

    const result = await setVisibility({ days: [], eventId: fixture.event.id });

    expect(result).toEqual({ message: "Programa oculto.", status: "success" });
    expect(await readVisibleProgramDays(fixture.event.id)).toEqual([]);
  });

  test("two saves at once leave one of them whole", async () => {
    const fixture = await seedJudgingFixture();

    await Promise.all([
      setVisibleProgramDays(fixture.event.id, ["2026-12-04", "2026-12-05"]),
      setVisibleProgramDays(fixture.event.id, ["2026-12-05"]),
    ]);

    expect([["2026-12-04", "2026-12-05"], ["2026-12-05"]]).toContainEqual(
      await readVisibleProgramDays(fixture.event.id),
    );
  });

  test("refuses a value that is not a day", async () => {
    const fixture = await seedJudgingFixture();

    const result = await setVisibility({
      days: ["mañana"],
      eventId: fixture.event.id,
    });

    expect(result).toMatchObject({
      data: { status: "error" },
      init: { status: 400 },
    });
    expect(await readVisibleProgramDays(fixture.event.id)).toEqual([]);
  });

  test("refuses a day the event has no schedule on", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addPresentation({
      name: "Una",
      orderNumber: 1,
      scheduledDate: "2026-12-04",
    });

    const result = await setVisibility({
      days: ["2026-12-04", "2027-01-01"],
      eventId: fixture.event.id,
    });

    expect(result).toMatchObject({
      data: { status: "error" },
      init: { status: 400 },
    });
    expect(await readVisibleProgramDays(fixture.event.id)).toEqual([]);
  });

  test("refuses a submission sent for an event that is no longer the active one", async () => {
    const fixture = await seedJudgingFixture();

    const result = await setVisibility({
      days: ["2026-12-04"],
      eventId: crypto.randomUUID(),
    });

    expect(result).toMatchObject({
      data: { status: "error" },
      init: { status: 409 },
    });
    expect(await readVisibleProgramDays(fixture.event.id)).toEqual([]);
  });
});
