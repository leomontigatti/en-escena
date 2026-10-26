import { describe, expect, test } from "vitest";

import { seminarPlacesShortMessage } from "./seminar-cobro-refusals";

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
