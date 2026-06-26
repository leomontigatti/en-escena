import { desc } from "drizzle-orm";

import { db } from "@/db";
import { events as eventsTable } from "@/db/schema";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import { getEventRegistrationReadinessByEventId } from "@/lib/events/registration-readiness.server";
import type { AdministrativeEventsListLoaderData } from "./shared";
type EventRow = typeof eventsTable.$inferSelect;
type TemporalState = ReturnType<typeof getTemporalState>;

export async function loadAdministrativeEvents(
  request: Request,
): Promise<AdministrativeEventsListLoaderData> {
  await requireAdminPanelUser(request);
  const eventRows = await db.query.events.findMany({
    orderBy: [desc(eventsTable.startsAt)],
  });
  const now = new Date();
  const eventsWithTemporalState = eventRows.map((event) => {
    const temporalState = getTemporalState(event, now);

    return {
      event,
      shouldShowRegistrationReadiness: shouldShowRegistrationReadiness(
        event,
        temporalState,
      ),
      temporalState,
    };
  });
  const eventReadinessById = await getEventRegistrationReadinessByEventId(
    eventsWithTemporalState
      .filter((eventState) => eventState.shouldShowRegistrationReadiness)
      .map(({ event }) => event.id),
  );

  return {
    events: eventsWithTemporalState.map(
      ({ event, shouldShowRegistrationReadiness, temporalState }) => ({
        ...event,
        isRegistrationReady: eventReadinessById.get(event.id)?.isReady ?? false,
        shouldShowRegistrationReadiness,
        temporalState,
      }),
    ),
  };
}

function shouldShowRegistrationReadiness(
  event: Pick<EventRow, "active">,
  temporalState: TemporalState,
) {
  return event.active || temporalState.value !== "finished";
}

function getTemporalState(
  event: Pick<EventRow, "startsAt" | "endsAt">,
  now: Date,
) {
  if (now < event.startsAt) {
    return { label: "No iniciado", value: "not-started" } as const;
  }

  if (now > event.endsAt) {
    return { label: "Finalizado", value: "finished" } as const;
  }

  return { label: "En curso", value: "in-progress" } as const;
}
