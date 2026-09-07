import { describe, expect, test } from "vitest";

import {
  futureBirthDateMessage,
  invalidBirthDateMessage,
  underageBirthDateMessage,
} from "@/lib/dancers/birth-date";

import { buildPortalDancerSchema } from "./shared";

const eventStartDate = "2026-09-25";

describe("portal dancer update schema", () => {
  test("applies the shared birth-date rules", () => {
    expect(parseBirthDate("no-es-fecha")).toEqual([invalidBirthDateMessage]);
    expect(parseBirthDate("2999-01-01")).toEqual([futureBirthDateMessage]);
    expect(parseBirthDate("2026-01-15")).toEqual([underageBirthDateMessage]);
    expect(parseBirthDate("2025-09-25")).toEqual([]);
  });

  test("keeps the date checks without an active event", () => {
    expect(parseBirthDate("no-es-fecha", null)).toEqual([
      invalidBirthDateMessage,
    ]);
    expect(parseBirthDate("2999-01-01", null)).toEqual([
      futureBirthDateMessage,
    ]);
    expect(parseBirthDate("2026-01-15", null)).toEqual([]);
  });
});

function parseBirthDate(
  birthDate: string,
  eventStart: string | null = eventStartDate,
) {
  const result = buildPortalDancerSchema(eventStart).safeParse({
    firstName: "Ana",
    lastName: "Paz",
    birthDate,
    documentType: "",
    documentNumber: "",
    documentFrontImageStorageKey: "",
    documentBackImageStorageKey: "",
  });

  return result.success
    ? []
    : result.error.issues
        .filter((issue) => issue.path[0] === "birthDate")
        .map((issue) => issue.message);
}
