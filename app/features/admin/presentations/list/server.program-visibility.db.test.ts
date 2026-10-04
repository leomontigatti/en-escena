import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events } from "@/db/schema";
import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";

import {
  handlePresentationListAction,
  loadPresentationListRouteData,
} from "./server";
import {
  programEventIdFieldName,
  programVisibleFieldName,
  setProgramVisibilityIntent,
} from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const listUrl = "http://localhost/administracion/presentaciones";

async function setVisibility(input: { eventId: string; visible: boolean }) {
  const body = new FormData();
  body.set("intent", setProgramVisibilityIntent);
  body.set(programEventIdFieldName, input.eventId);
  body.set(programVisibleFieldName, String(input.visible));

  const { request } = await createSignedInAdminRequest({
    body,
    email: `${crypto.randomUUID()}@example.com`,
    requestUrl: listUrl,
    role: "admin",
  });

  return await handlePresentationListAction(request);
}

async function readProgramVisible(eventId: string) {
  const [event] = await db
    .select({ programVisible: events.programVisible })
    .from(events)
    .where(eq(events.id, eventId));

  return event.programVisible;
}

describe("showing and hiding the program from the participation list", () => {
  test("shows the program, and the list says it is visible", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addPresentation({ name: "Una", orderNumber: 1 });

    const result = await setVisibility({
      eventId: fixture.event.id,
      visible: true,
    });

    expect(result).toEqual({ message: "Programa visible.", status: "success" });
    expect(await readProgramVisible(fixture.event.id)).toBe(true);

    const { request } = await createSignedInAdminRequest({
      email: `${crypto.randomUUID()}@example.com`,
      requestUrl: listUrl,
      role: "admin",
    });

    await expect(loadPresentationListRouteData(request)).resolves.toMatchObject(
      { programVisible: true },
    );
  });

  test("hides the program", async () => {
    const fixture = await seedJudgingFixture();
    await db
      .update(events)
      .set({ programVisible: true })
      .where(eq(events.id, fixture.event.id));

    const result = await setVisibility({
      eventId: fixture.event.id,
      visible: false,
    });

    expect(result).toEqual({ message: "Programa oculto.", status: "success" });
    expect(await readProgramVisible(fixture.event.id)).toBe(false);
  });

  test("refuses a toggle sent for an event that is no longer the active one", async () => {
    const fixture = await seedJudgingFixture();

    const result = await setVisibility({
      eventId: crypto.randomUUID(),
      visible: true,
    });

    expect(result).toMatchObject({
      data: { status: "error" },
      init: { status: 409 },
    });
    expect(await readProgramVisible(fixture.event.id)).toBe(false);
  });
});
