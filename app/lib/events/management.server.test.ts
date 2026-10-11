import { describe, expect, test } from "vitest";

import { createEvent } from "@/lib/events/management.server";

// Each case is refused before the insert: a write would need a database this
// suite does not have.
describe("createEvent", () => {
  test.each([
    [
      "deposit below range",
      eventInput({ requiredDepositPercentage: 0 }),
      "requiredDepositPercentage",
    ],
    [
      "deposit above range",
      eventInput({ requiredDepositPercentage: 101 }),
      "requiredDepositPercentage",
    ],
    [
      "non-integer deposit",
      eventInput({ requiredDepositPercentage: 30.5 }),
      "requiredDepositPercentage",
    ],
    [
      "event start after event end",
      eventInput({
        startsAt: date("2026-05-03T12:00:00Z"),
        endsAt: date("2026-05-02T12:00:00Z"),
      }),
      "startsAt",
    ],
  ] as const)("rejects invalid event data: %s", async (_case, input, field) => {
    const result = await createEvent(input);

    expect(result).toMatchObject({
      ok: false,
      code: "invalid-event",
      fieldErrors: {
        [field]: expect.any(String),
      },
    });
  });
});

function eventInput(
  overrides: Partial<Parameters<typeof createEvent>[0]> = {},
) {
  return {
    name: "Evento 2026",
    startsAt: date("2026-05-01T12:00:00Z"),
    endsAt: date("2026-05-03T12:00:00Z"),
    ...overrides,
  };
}

function date(value: string) {
  return new Date(value);
}
