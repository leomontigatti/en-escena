import { describe, expect, test } from "vitest";

import { getScheduleCategoryOptions } from "./view-shared";

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
