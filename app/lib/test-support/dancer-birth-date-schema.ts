import { expect } from "vitest";

import {
  futureBirthDateMessage,
  invalidBirthDateMessage,
  underageBirthDateMessage,
} from "@/lib/dancers/birth-date";

type BirthDateSchema = {
  safeParse(values: Record<string, string>):
    | { success: true }
    | {
        success: false;
        error: { issues: Array<{ path: PropertyKey[]; message: string }> };
      };
};

const eventStartDate = "2026-09-25";

/**
 * The birth-date rules every dancer schema shares, asserted through the schema
 * a surface actually parses with: the rule is only shared if all three surfaces
 * reject the same values, so all three assert them from here.
 */
export function expectSharedBirthDateRules(input: {
  buildSchema: (eventStartDate: string | null) => BirthDateSchema;
  values: Record<string, string>;
}) {
  const readMessages = (birthDate: string, eventStart: string | null) => {
    const result = input
      .buildSchema(eventStart)
      .safeParse({ ...input.values, birthDate });

    return result.success
      ? []
      : result.error.issues
          .filter((issue) => issue.path[0] === "birthDate")
          .map((issue) => issue.message);
  };

  expect(readMessages("no-es-fecha", eventStartDate)).toEqual([
    invalidBirthDateMessage,
  ]);
  expect(readMessages("2999-01-01", eventStartDate)).toEqual([
    futureBirthDateMessage,
  ]);
  expect(readMessages("2026-01-15", eventStartDate)).toEqual([
    underageBirthDateMessage,
  ]);
  // The boundary is the whole point: exactly one year old at the start passes.
  expect(readMessages("2025-09-25", eventStartDate)).toEqual([]);

  // Without an active event the age is unmeasurable, so only the date checks
  // survive.
  expect(readMessages("no-es-fecha", null)).toEqual([invalidBirthDateMessage]);
  expect(readMessages("2999-01-01", null)).toEqual([futureBirthDateMessage]);
  expect(readMessages("2026-01-15", null)).toEqual([]);
}
