import { describe, expect, test } from "vitest";

import {
  collectScheduleRegistrationOpenBlockers,
  eventEndedRegistrationOpenBlocker,
} from "@/lib/schedules/registration-open";

const now = new Date("2026-05-01T12:00:00.000Z");

describe("collectScheduleRegistrationOpenBlockers", () => {
  test("lets a ready event that has not finished open a schedule", () => {
    expect(
      collectScheduleRegistrationOpenBlockers({
        now,
        endsAt: new Date("2026-06-01T12:00:00.000Z"),
        readiness: { eventId: "event_1", isReady: true, missingItems: [] },
      }),
    ).toEqual([]);
  });

  test("names every missing item of an unready event", () => {
    expect(
      collectScheduleRegistrationOpenBlockers({
        now,
        endsAt: new Date("2026-06-01T12:00:00.000Z"),
        readiness: {
          eventId: "event_1",
          isReady: false,
          missingItems: [
            {
              code: "prices",
              label: "Precios",
              detail: "Falta al menos un precio en este evento.",
            },
            {
              code: "age-coverage",
              label: "Cobertura de edades",
              detail:
                "Faltan categorías para Modalidad Jazz, Tipo de grupo Solo.",
            },
          ],
        },
      }),
    ).toEqual([
      "Falta al menos un precio en este evento.",
      "Faltan categorías para Modalidad Jazz, Tipo de grupo Solo.",
    ]);
  });

  test("adds the finished event on top of whatever readiness says", () => {
    expect(
      collectScheduleRegistrationOpenBlockers({
        now,
        endsAt: new Date("2026-04-30T12:00:00.000Z"),
        readiness: { eventId: "event_1", isReady: true, missingItems: [] },
      }),
    ).toEqual([eventEndedRegistrationOpenBlocker]);
  });
});
