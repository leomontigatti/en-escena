import { sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographies, presentations } from "@/db/schema";
import {
  allocateChoreographyNumberForTest,
  createAcademySession,
  createOpenEventCatalog,
} from "@/lib/choreographies/registration-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

async function createNumberedChoreographies(count: number) {
  const owner = await createAcademySession({
    academyName: `Academia ${crypto.randomUUID()}`,
    email: `${crypto.randomUUID()}@example.com`,
  });
  const { event, catalog } = await createOpenEventCatalog();
  const created = [];

  for (let index = 0; index < count; index += 1) {
    const choreographyNumber = await allocateChoreographyNumberForTest(
      event.id,
    );
    const [choreography] = await db
      .insert(choreographies)
      .values({
        academyId: owner.academyId,
        categoryCalculationMode: "oldest",
        categoryId: catalog.childCategory.id,
        choreographyNumber,
        eventId: event.id,
        groupType: "solo",
        modalityId: catalog.modality.id,
        name: `Pieza ${index + 1}`,
        scheduleId: catalog.schedule.id,
      })
      .returning();

    const [presentation] = await db
      .insert(presentations)
      .values({
        choreographyId: choreography.id,
        eventId: event.id,
        orderNumber: index + 1,
      })
      .returning();

    created.push({ choreography, presentation });
  }

  return { created, event };
}

describe("presentation table", () => {
  test("refuses two presentations of one event sharing an order number", async () => {
    const { created } = await createNumberedChoreographies(2);

    await expect(
      db
        .update(presentations)
        .set({ orderNumber: 1 })
        .where(sql`${presentations.id} = ${created[1].presentation.id}`),
    ).rejects.toThrow();
  });

  test("lets two presentations swap their numbers inside one transaction", async () => {
    const { created, event } = await createNumberedChoreographies(2);

    await db.transaction(async (tx) => {
      await tx
        .update(presentations)
        .set({ orderNumber: 2 })
        .where(sql`${presentations.id} = ${created[0].presentation.id}`);
      await tx
        .update(presentations)
        .set({ orderNumber: 1 })
        .where(sql`${presentations.id} = ${created[1].presentation.id}`);
    });

    const rows = await db
      .select({
        choreographyId: presentations.choreographyId,
        orderNumber: presentations.orderNumber,
      })
      .from(presentations)
      .where(sql`${presentations.eventId} = ${event.id}`)
      .orderBy(presentations.orderNumber);

    expect(rows).toEqual([
      { choreographyId: created[1].choreography.id, orderNumber: 1 },
      { choreographyId: created[0].choreography.id, orderNumber: 2 },
    ]);
  });

  test("keeps a choreography to a single presentation", async () => {
    const { created, event } = await createNumberedChoreographies(1);

    await expect(
      db.insert(presentations).values({
        choreographyId: created[0].choreography.id,
        eventId: event.id,
        orderNumber: 2,
      }),
    ).rejects.toThrow();
  });
});
