import { activateEvent, createEvent } from "@/lib/events/management.server";

let createdEventOffset = 0;

export async function createSavedEvent(
  name: string,
  options: { activate?: boolean } = {},
) {
  const eventOffset = createdEventOffset++;
  const registrationStartsAt = new Date(
    Date.UTC(2030 + eventOffset, 2, 1, 12, 0, 0),
  );
  const registrationEndsAt = new Date(
    Date.UTC(2030 + eventOffset, 3, 30, 12, 0, 0),
  );
  const startsAt = new Date(Date.UTC(2030 + eventOffset, 4, 1, 12, 0, 0));
  const endsAt = new Date(Date.UTC(2030 + eventOffset, 4, 3, 12, 0, 0));
  const result = await createEvent({
    name,
    registrationStartsAt,
    registrationEndsAt,
    startsAt,
    endsAt,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  if (options.activate) {
    const activationResult = await activateEvent(result.event.id);

    if (!activationResult.ok) {
      throw new Error(activationResult.error);
    }
  }

  return result.event;
}

export async function expectCreated<TRecord extends { id: string }>(
  resultPromise: Promise<{
    ok: boolean;
    record?: TRecord;
  }>,
) {
  const result = await resultPromise;

  if (!result.ok || !result.record) {
    throw new Error("Expected Bases del evento creation to succeed.");
  }

  return result.record;
}
