import { eq } from "drizzle-orm";
import { expect, test } from "vitest";

import { db } from "@/db";
import { choreographies } from "@/db/schema";
import {
  createChoreographyRecord,
  createEventRecord,
} from "@/features/portal/choreographies/test-support/db";
import { orderByChoreographyName } from "@/lib/choreographies/choreography-name.server";
import {
  createAcademySession,
  createEventCatalog,
} from "@/lib/choreographies/registration-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

test("orders a list by name ignoring case and accents, the stored name breaking a tie (#764)", async () => {
  const event = await createEventRecord({ active: true, name: "Regional" });
  const catalog = await createEventCatalog(event.id);
  const owner = await createAcademySession({
    academyName: "Academia Orden",
    email: "academia.orden.nombre@example.com",
  });

  // Stored out of order, and in the shapes the raw column sorts badly: an
  // accented initial, a lowercase one, and two names that fold to one text.
  for (const name of [
    "Zamba",
    "los cascanueces",
    "Ángeles",
    "angeles",
    "Bolero",
    "Élite",
  ]) {
    await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.teenCategory.id,
      eventId: event.id,
      groupType: "solo",
      modalityId: catalog.modality.id,
      name,
      scheduleCapacityId: catalog.soloScheduleCapacity.id,
    });
  }

  const rows = await db
    .select({ name: choreographies.name })
    .from(choreographies)
    .where(eq(choreographies.eventId, event.id))
    .orderBy(...orderByChoreographyName(choreographies.name));

  expect(rows.map((row) => row.name)).toEqual([
    "angeles",
    "Ángeles",
    "Bolero",
    "Élite",
    "los cascanueces",
    "Zamba",
  ]);
});
