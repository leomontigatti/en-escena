import { describe, expect, test } from "vitest";

import {
  formatScheduleDateTimeLabel,
  formatScheduleRegistrationStateLabel,
  getScheduleCategoryOptions,
} from "./view-shared";

const categories = [
  {
    id: "category_baby",
    name: "Baby",
    minAge: 4,
    maxAge: 6,
    groupTypes: ["solo", "duo"] as const,
    modalityIds: ["modality_jazz"],
  },
  {
    id: "category_infantil",
    name: "Infantil I",
    minAge: 7,
    maxAge: 9,
    groupTypes: ["solo", "duo", "trio"] as const,
    modalityIds: ["modality_jazz", "modality_urbanas"],
  },
  {
    id: "category_juvenil",
    name: "Juvenil",
    minAge: 13,
    maxAge: 17,
    groupTypes: ["grupal"] as const,
    modalityIds: ["modality_urbanas"],
  },
];

describe("getScheduleCategoryOptions", () => {
  // A category that shares no modality with the schedule could never be
  // resolved into it, so it is not offered.
  test("offers only the categories sharing a modality with the schedule", () => {
    expect(
      getScheduleCategoryOptions(categories, ["modality_jazz"]).map(
        (option) => option.value,
      ),
    ).toEqual(["category_baby", "category_infantil"]);
    expect(
      getScheduleCategoryOptions(categories, [
        "modality_jazz",
        "modality_urbanas",
      ]).map((option) => option.value),
    ).toEqual(["category_baby", "category_infantil", "category_juvenil"]);
    expect(getScheduleCategoryOptions(categories, [])).toEqual([]);
  });

  // Category names repeat inside an event, so the age range and the group
  // types are what tell two options with the same name apart.
  test("labels each category with its age range and group types", () => {
    expect(
      getScheduleCategoryOptions(categories, ["modality_jazz"]).map(
        (option) => option.label,
      ),
    ).toEqual(["Baby · 4–6 · solo, dúo", "Infantil I · 7–9 · solo, dúo, trío"]);
  });
});

describe("formatScheduleDateTimeLabel", () => {
  // The list reads one instant per row, so the day and the hour are one text
  // instead of two columns the reader has to put back together.
  test("reads the day and the hour as a single label", () => {
    expect(
      formatScheduleDateTimeLabel({
        scheduledDate: "2026-10-21",
        startTime: "12:30",
      }),
    ).toBe("21 de octubre de 2026, 12:30");
  });

  // The column stores seconds the reader never asked for.
  test("drops the seconds of the stored time", () => {
    expect(
      formatScheduleDateTimeLabel({
        scheduledDate: "2026-10-21",
        startTime: "12:30:00",
      }),
    ).toBe("21 de octubre de 2026, 12:30");
  });
});

describe("formatScheduleRegistrationStateLabel", () => {
  // Plural, as every surface of the vocabulary says it.
  test("names the two states of a schedule's inscriptions", () => {
    expect(formatScheduleRegistrationStateLabel(true)).toBe("Abiertas");
    expect(formatScheduleRegistrationStateLabel(false)).toBe("Cerradas");
  });
});
