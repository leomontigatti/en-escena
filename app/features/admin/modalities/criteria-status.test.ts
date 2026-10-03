import { describe, expect, test } from "vitest";

import {
  incompleteSubmodalities,
  modalityCriteriaStatus,
} from "./criteria-status";
import type {
  EventSubmodalityCriterionRow,
  EventSubmodalityRow,
} from "./shared";

const solo = submodality("solo", "Solo");
const duo = submodality("duo", "Dúo");
const sheets = {
  generalStandsAlone: false,
  levels: ["amateur", "profesional"],
} as const;

describe("a modality's criteria status", () => {
  test("has no criteria while every submodality scores with a single value", () => {
    const setup = { criteria: [], sheets, submodalities: [solo, duo] };

    expect(incompleteSubmodalities(setup)).toEqual([]);
    expect(modalityCriteriaStatus(setup)).toBe("none");
  });

  test("names the submodalities with a sheet short of 100", () => {
    const setup = {
      criteria: [
        criterion(solo, "Técnica", 60),
        criterion(solo, "Figuras", 40, "amateur"),
        criterion(duo, "Técnica", 100),
      ],
      sheets,
      submodalities: [solo, duo],
    };

    // Solo's amateur sheet reaches 100, its profesional one stays at 60.
    expect(incompleteSubmodalities(setup)).toEqual([solo]);
    expect(modalityCriteriaStatus(setup)).toBe("incomplete");
  });

  test("is complete once every sheet with criteria reaches 100", () => {
    const setup = {
      criteria: [criterion(duo, "Técnica", 100)],
      sheets,
      submodalities: [solo, duo],
    };

    expect(incompleteSubmodalities(setup)).toEqual([]);
    expect(modalityCriteriaStatus(setup)).toBe("complete");
  });

  test("counts a level no category offers any more while it holds criteria, as the editor lists it", () => {
    const setup = {
      criteria: [
        criterion(solo, "Técnica", 100),
        criterion(solo, "Figuras", 10, "amateur"),
      ],
      sheets: { generalStandsAlone: true, levels: [] },
      submodalities: [solo],
    };

    expect(incompleteSubmodalities(setup)).toEqual([solo]);
  });

  test("ignores the criteria of another modality's submodalities", () => {
    const setup = {
      criteria: [criterion(duo, "Técnica", 60)],
      sheets,
      submodalities: [solo],
    };

    expect(modalityCriteriaStatus(setup)).toBe("none");
  });
});

function submodality(id: string, name: string): EventSubmodalityRow {
  return {
    id,
    eventId: "event_1",
    modalityId: "modality_1",
    name,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function criterion(
  owner: EventSubmodalityRow,
  name: string,
  maximum: number,
  experienceLevel: EventSubmodalityCriterionRow["experienceLevel"] = null,
): EventSubmodalityCriterionRow {
  return {
    eventId: "event_1",
    experienceLevel,
    id: `criterion-${owner.id}-${name}`,
    kind: "adds",
    maximum,
    name,
    position: 0,
    submodalityId: owner.id,
  };
}
