import {
  activateEvent,
  createEvent,
  type CreateEventInput,
} from "@/lib/events/management.server";

// 1 to 3 May of `year`, at noon UTC.
export function eventDates(year: number) {
  return {
    startsAt: new Date(Date.UTC(year, 4, 1, 12, 0, 0)),
    endsAt: new Date(Date.UTC(year, 4, 3, 12, 0, 0)),
  };
}

// A saved event, active unless `active: false`: "En Escena 2026", 1 to 3 May
// 2026. Activation fails when another event is already active.
export async function createSavedEvent(
  input: Partial<CreateEventInput> & { active?: boolean } = {},
) {
  const { active = true, ...overrides } = input;
  const result = await createEvent({
    name: "En Escena 2026",
    ...eventDates(2026),
    ...overrides,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  if (!active) {
    return result.event;
  }

  const activation = await activateEvent(result.event.id);

  if (!activation.ok) {
    throw new Error(activation.error);
  }

  return activation.event;
}
