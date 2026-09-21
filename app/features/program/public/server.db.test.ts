import { eq, sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events, presentations } from "@/db/schema";
import {
  createChoreographyRecord,
  createEventCatalog,
} from "@/features/portal/choreographies/test-support/db";
import {
  createAcademyUser,
  createSavedEvent,
  createSignedInRequest,
} from "@/lib/admin/finances/finances.test-support";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

import { loadPublicProgram } from "./server";

installDatabaseTestHooks();

const programUrl = "http://localhost/programa";

async function seedPublishedProgram() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const catalog = await createEventCatalog(event.id);
  const { academy } = await createAcademyUser({
    academyName: "Academia Norte",
    email: `${crypto.randomUUID()}@example.com`,
  });
  const choreography = await createChoreographyRecord({
    academyId: academy.id,
    categoryId: catalog.categoryWithLevel.id,
    eventId: event.id,
    experienceLevelId: catalog.level.id,
    modalityId: catalog.modality.id,
    name: "Pieza",
    scheduleCapacityId: catalog.scheduleCapacity.id,
  });

  await db.insert(presentations).values({
    choreographyId: choreography.id,
    eventId: event.id,
    orderNumber: 1,
  });
  await db
    .update(events)
    .set({ active: true, programVisible: true })
    .where(eq(events.id, event.id));

  return { catalog, choreography, event };
}

describe("loadPublicProgram", () => {
  test("answers an anonymous request with the published program", async () => {
    const { choreography, event } = await seedPublishedProgram();

    const loaderData = await loadPublicProgram(new Request(programUrl));

    expect(loaderData.event?.name).toBe(event.name);
    expect(loaderData.hasAcademySession).toBe(false);
    expect(loaderData.rows.map((row) => row.choreographyId)).toEqual([
      choreography.id,
    ]);
    expect(loaderData.schedules).toHaveLength(1);
  });

  test("answers the same nothing with the program hidden and with no active event", async () => {
    const { event } = await seedPublishedProgram();

    await db
      .update(events)
      .set({ programVisible: false })
      .where(eq(events.id, event.id));

    const hidden = await loadPublicProgram(new Request(programUrl));

    await db
      .update(events)
      .set({ active: false, programVisible: true })
      .where(eq(events.id, event.id));

    const noEvent = await loadPublicProgram(new Request(programUrl));

    expect(hidden).toEqual(noEvent);
    expect(hidden.event).toBeNull();
    expect(hidden.rows).toEqual([]);
  });

  test("reads the academy's session without asking for one", async () => {
    await seedPublishedProgram();
    const signedIn = await createSignedInRequest({
      email: `${crypto.randomUUID()}@example.com`,
      requestUrl: programUrl,
      role: "academy",
    });

    expect((await loadPublicProgram(signedIn.request)).hasAcademySession).toBe(
      true,
    );

    const internal = await createSignedInRequest({
      email: `${crypto.randomUUID()}@example.com`,
      requestUrl: programUrl,
      role: "admin",
    });

    expect((await loadPublicProgram(internal.request)).hasAcademySession).toBe(
      false,
    );
  });

  // The product's first unauthenticated content route: reading the program is
  // not a reason to be given a session, so an anonymous load leaves the session
  // table exactly as it found it.
  test("creates no session for an anonymous reader", async () => {
    await seedPublishedProgram();

    const before = await countAccessSessions();

    await loadPublicProgram(new Request(programUrl));

    expect(await countAccessSessions()).toBe(before);
  });
});

async function countAccessSessions() {
  const result = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from "en_escena_access_session"`,
  );

  return readRows(result)[0].count;
}

// `db.execute` hands back a bare array on postgres.js and a `{ rows }` envelope
// on PGlite, which is what the fast config runs. Same shape as the helper in
// `tests/db/schema-security.db.test.ts`.
function readRows<Row extends object>(result: { rows: Row[] } | Row[]) {
  return Array.isArray(result) ? result : result.rows;
}
