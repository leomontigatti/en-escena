import { describe, expect, test } from "vitest";

import {
  countSeminarPlacesShort,
  seminarPlacesShortMessage,
} from "./seminar-places";

describe("countSeminarPlacesShort", () => {
  test("is zero while the places needed fit in what the quota leaves", () => {
    expect(
      countSeminarPlacesShort({ coveredCount: 7, neededCount: 3, quota: 10 }),
    ).toBe(0);
  });

  test("is how many places the crossings exceed the quota by", () => {
    expect(
      countSeminarPlacesShort({ coveredCount: 8, neededCount: 4, quota: 10 }),
    ).toBe(2);
  });

  test("counts every needed place as short once the seminar is already over its quota", () => {
    // A quota lowered under the places already taken leaves the covered rows
    // where they are; only the new crossings are refused.
    expect(
      countSeminarPlacesShort({ coveredCount: 12, neededCount: 2, quota: 10 }),
    ).toBe(2);
  });

  test("is zero when nothing crosses, even in a full seminar", () => {
    expect(
      countSeminarPlacesShort({ coveredCount: 10, neededCount: 0, quota: 10 }),
    ).toBe(0);
  });
});

describe("seminarPlacesShortMessage", () => {
  test("names the seminar by instructor and date and says how many places it is short", () => {
    expect(
      seminarPlacesShortMessage([
        {
          instructorName: "Abril Sosa",
          scheduledDate: "2030-10-10",
          shortBy: 2,
        },
      ]),
    ).toBe(
      "No quedan lugares suficientes en el seminario de Abril Sosa del 10 de octubre de 2030: faltan 2.",
    );
  });

  test("names each short seminar when several are", () => {
    expect(
      seminarPlacesShortMessage([
        {
          instructorName: "Abril Sosa",
          scheduledDate: "2030-10-10",
          shortBy: 1,
        },
        {
          instructorName: "Nicolás Prado",
          scheduledDate: "2030-10-11",
          shortBy: 3,
        },
      ]),
    ).toBe(
      "No quedan lugares suficientes en el seminario de Abril Sosa del 10 de octubre de 2030: falta 1. No quedan lugares suficientes en el seminario de Nicolás Prado del 11 de octubre de 2030: faltan 3.",
    );
  });
});
