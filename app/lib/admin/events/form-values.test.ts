import { describe, expect, test } from "vitest";

import {
  parseEventFormValues,
  registrationAfterEventStartMessage,
} from "@/lib/admin/events/form-values";

function eventValues(overrides: Record<string, string> = {}) {
  return {
    name: "En Escena 2027",
    registrationStartsAt: "2027-04-01",
    registrationEndsAt: "2027-04-20",
    startsAt: "2027-05-01",
    endsAt: "2027-05-03",
    requiredDepositPercentage: "30",
    ...overrides,
  };
}

describe("parseEventFormValues", () => {
  test("accepts inscriptions that open before the event", () => {
    expect(parseEventFormValues(eventValues()).ok).toBe(true);
  });

  // The same schema backs `zodResolver`, so this is also what the field shows
  // before the form is ever submitted.
  test("refuses inscriptions that open after the event starts", () => {
    const result = parseEventFormValues(
      eventValues({ registrationStartsAt: "2027-05-02" }),
    );

    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        registrationStartsAt: registrationAfterEventStartMessage,
      },
    });
  });

  test("accepts inscriptions that open the day the event starts", () => {
    const result = parseEventFormValues(
      eventValues({ registrationStartsAt: "2027-05-01" }),
    );

    expect(result.ok).toBe(true);
  });
});
