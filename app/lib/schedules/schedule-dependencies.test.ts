import { describe, expect, test } from "vitest";

import {
  getScheduleDateTimeLockReasons,
  getScheduleDeleteBlockReasons,
  type ScheduleDependencySummary,
} from "@/lib/schedules/schedule-dependencies";

const free: ScheduleDependencySummary = {
  coveringPriceNames: [],
  occupyingChoreographyCount: 0,
  withdrawnChoreographyCount: 0,
};

describe("schedule dependency reasons", () => {
  test("a free schedule locks and blocks nothing", () => {
    expect(getScheduleDateTimeLockReasons(free)).toEqual([]);
    expect(getScheduleDeleteBlockReasons(free)).toEqual([]);
  });

  test("occupying choreographies and covering prices lock date and time and block the delete", () => {
    const held = {
      ...free,
      coveringPriceNames: ["Función", "Noche"],
      occupyingChoreographyCount: 2,
    };

    expect(getScheduleDateTimeLockReasons(held)).toEqual([
      "Tiene 2 coreografías asignadas.",
      "Lo cubren los precios Función y Noche.",
    ]);
    expect(getScheduleDeleteBlockReasons(held)).toEqual([
      "Tiene 2 coreografías asignadas.",
      "Lo cubren los precios Función y Noche.",
    ]);
  });

  test("speaks of one choreography and one price in the singular", () => {
    expect(
      getScheduleDateTimeLockReasons({
        ...free,
        coveringPriceNames: ["Función"],
        occupyingChoreographyCount: 1,
      }),
    ).toEqual(["Tiene 1 coreografía asignada.", "Lo cubre el precio Función."]);
  });

  // A withdrawn choreography holds no place, so the date can still move, but
  // its reference to the schedule cannot be released, so the delete cannot.
  test("withdrawn choreographies block only the delete", () => {
    const withdrawn = { ...free, withdrawnChoreographyCount: 1 };

    expect(getScheduleDateTimeLockReasons(withdrawn)).toEqual([]);
    expect(getScheduleDeleteBlockReasons(withdrawn)).toEqual([
      "Tiene 1 coreografía retirada asignada.",
    ]);
  });
});
