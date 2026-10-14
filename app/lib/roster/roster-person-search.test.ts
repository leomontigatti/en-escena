import { describe, expect, test } from "vitest";

import { matchesRosterPersonSearch } from "./roster-person-search";

const person = {
  firstName: "Ana María",
  lastName: "de la Cruz",
  documentNumber: "12345678",
};

describe("matchesRosterPersonSearch", () => {
  // #735: the search was matched raw against the stored digits, so a DNI
  // typed the way it is printed found nobody.
  test.each(["12.345.678", "12 345 678", "12345678", "345.678"])(
    "finds the person by the document typed as %j",
    (search) => {
      expect(matchesRosterPersonSearch(person, search)).toBe(true);
    },
  );

  test.each(["ana maria de la cruz", "de la cruz ana", "Cruz"])(
    "finds the person by the name typed as %j",
    (search) => {
      expect(matchesRosterPersonSearch(person, search)).toBe(true);
    },
  );

  test.each(["87.654.321", "Pedro"])("leaves out %j", (search) => {
    expect(matchesRosterPersonSearch(person, search)).toBe(false);
  });
});
