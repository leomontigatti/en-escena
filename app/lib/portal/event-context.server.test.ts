import { afterEach, describe, expect, test, vi } from "vitest";

const findEvents = vi.hoisted(() => vi.fn());
const getEventRegistrationReadiness = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    query: {
      events: {
        findMany: findEvents,
      },
    },
  },
}));

vi.mock("@/lib/events/registration-readiness.server", () => ({
  getEventRegistrationReadiness,
}));

import {
  getPortalActiveEventContext,
  getPortalActiveEventReadinessContext,
  getPortalShellEventContext,
} from "@/lib/portal/event-context.server";

describe("portal event context helpers", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("keeps shell and summary contexts on the active-event summary path without readiness work", async () => {
    findEvents.mockResolvedValue([
      buildEventSummary({
        id: "event_active",
        name: "Regional 2026",
        active: true,
      }),
      buildEventSummary({
        id: "event_historical",
        name: "Regional 2025",
        active: false,
      }),
    ]);

    await expect(
      getPortalShellEventContext(new Request("http://localhost/portal")),
    ).resolves.toMatchObject({
      activeEvent: { id: "event_active", name: "Regional 2026" },
    });

    await expect(
      getPortalActiveEventContext(
        new Request("http://localhost/portal/profesores"),
      ),
    ).resolves.toMatchObject({
      activeEvent: { id: "event_active" },
      selectedEvent: { id: "event_active" },
      hasActiveEvent: true,
      hasEvents: true,
      isReadOnly: false,
    });

    expect(getEventRegistrationReadiness).not.toHaveBeenCalled();
  });

  test("loads readiness only for routes that ask for the full active-event context", async () => {
    findEvents.mockResolvedValue([
      buildEventSummary({
        id: "event_active",
        name: "Regional 2026",
        active: true,
      }),
    ]);
    getEventRegistrationReadiness.mockResolvedValue({
      isReady: true,
      missingItems: [],
    });

    await expect(
      getPortalActiveEventReadinessContext(
        new Request("http://localhost/portal/coreografias"),
      ),
    ).resolves.toMatchObject({
      activeEvent: { id: "event_active" },
      activeEventRegistrationReadiness: {
        isReady: true,
        missingItems: [],
      },
    });

    expect(getEventRegistrationReadiness).toHaveBeenCalledWith("event_active");
  });
});

function buildEventSummary(overrides: Partial<EventSummaryFixture> = {}) {
  return {
    id: "event_1",
    name: "Regional 2026",
    active: false,
    registrationStartsAt: new Date("2026-01-01T12:00:00Z"),
    registrationEndsAt: new Date("2026-12-31T12:00:00Z"),
    startsAt: new Date("2026-02-01T12:00:00Z"),
    endsAt: new Date("2026-02-03T12:00:00Z"),
    ...overrides,
  };
}

type EventSummaryFixture = {
  id: string;
  name: string;
  active: boolean;
  registrationStartsAt: Date;
  registrationEndsAt: Date;
  startsAt: Date;
  endsAt: Date;
};
