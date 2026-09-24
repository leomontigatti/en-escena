import { describe, expect, test } from "vitest";

import { getPortalChoreographyCreationAvailability } from "@/lib/portal/choreography-creation-availability";
import type { PortalEventContext } from "@/lib/portal/event-context";

describe("portal choreography creation availability", () => {
  test("blocks creation with the shared closed-inscriptions copy", () => {
    const availability = getPortalChoreographyCreationAvailability({
      activeDancerCount: 2,
      eventContext: eventContext({ isRegistrationOpen: false }),
    });

    expect(availability.canCreate).toBe(false);
    expect(availability.blockers).toContainEqual({
      code: "registration-closed",
      message: "Las inscripciones están cerradas.",
    });
  });

  test("allows creation while any schedule keeps the inscriptions open", () => {
    const availability = getPortalChoreographyCreationAvailability({
      activeDancerCount: 2,
      eventContext: eventContext(),
    });

    expect(availability).toEqual({ canCreate: true, blockers: [] });
  });
});

function eventContext(
  overrides: Partial<PortalEventContext> = {},
): PortalEventContext {
  const event = {
    id: "event_1",
    name: "Regional 2026",
    active: true,
    startsAt: new Date("2026-05-01T12:00:00Z"),
    endsAt: new Date("2026-05-03T12:00:00Z"),
  };

  return {
    selectedEvent: event,
    activeEvent: event,
    hasActiveEvent: true,
    hasEvents: true,
    isReadOnly: false,
    isRegistrationOpen: true,
    activeEventRegistrationReadiness: {
      eventId: event.id,
      isReady: true,
      missingItems: [],
    },
    ...overrides,
  };
}
