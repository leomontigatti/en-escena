import { eq } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";
import { createEvent } from "@/lib/events/management.server";

type CreateSavedEventOverrides = Partial<Parameters<typeof createEvent>[0]> & {
  active?: boolean;
  programVisible?: boolean;
  resultsVisible?: boolean;
};

export function testEventDate(value: string) {
  return new Date(value);
}

export async function createPortalSavedEvent(
  overrides: CreateSavedEventOverrides = {},
) {
  return await createSavedEventWithDefaults("Evento", overrides);
}

export async function createAdminSavedEvent(
  overrides: CreateSavedEventOverrides = {},
) {
  return await createSavedEventWithDefaults("Evento 2026", overrides);
}

async function createSavedEventWithDefaults(
  defaultName: string,
  overrides: CreateSavedEventOverrides,
) {
  const { active, programVisible, resultsVisible, ...eventOverrides } =
    overrides;
  const result = await createEvent({
    name: defaultName,
    registrationStartsAt: testEventDate("2026-03-01T12:00:00Z"),
    registrationEndsAt: testEventDate("2026-04-30T12:00:00Z"),
    startsAt: testEventDate("2026-05-01T12:00:00Z"),
    endsAt: testEventDate("2026-05-03T12:00:00Z"),
    ...eventOverrides,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  const updates = {
    active,
    programVisible,
    resultsVisible,
  };
  const definedUpdates = Object.fromEntries(
    Object.entries(updates).filter(([, value]) => value !== undefined),
  );

  if (Object.keys(definedUpdates).length > 0) {
    await db
      .update(events)
      .set(definedUpdates)
      .where(eq(events.id, result.event.id));

    return { ...result.event, ...definedUpdates };
  }

  return result.event;
}
