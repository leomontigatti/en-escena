import { describe, expect, test } from "vitest";

import { rosterNameWarningMessage } from "@/lib/roster/roster-name-duplicates";

describe("rosterNameWarningMessage", () => {
  test("names the matching dancer of the reader's own academy", () => {
    expect(
      rosterNameWarningMessage({
        kind: "dancer-name",
        matches: [{ id: "a", label: "Ana Paz" }],
        scope: "portal",
      }),
    ).toBe(
      "Ya existe un Bailarín con el mismo nombre y fecha de nacimiento en tu academia: Ana Paz. ¿Es la misma persona?",
    );
  });

  test("speaks of the academy in the third person from the panel", () => {
    expect(
      rosterNameWarningMessage({
        kind: "dancer-name",
        matches: [{ id: "a", label: "Ana Paz" }],
        scope: "admin",
      }),
    ).toBe(
      "Ya existe un Bailarín con el mismo nombre y fecha de nacimiento en la academia: Ana Paz. ¿Es la misma persona?",
    );
  });

  test("leaves the birth date out for a professor", () => {
    expect(
      rosterNameWarningMessage({
        kind: "professor-name",
        matches: [{ id: "a", label: "Ana Paz" }],
        scope: "portal",
      }),
    ).toBe(
      "Ya existe un Profesor con el mismo nombre en tu academia: Ana Paz. ¿Es la misma persona?",
    );
  });

  test("lists every match it found", () => {
    expect(
      rosterNameWarningMessage({
        kind: "professor-name",
        matches: [
          { id: "a", label: "Ana Paz" },
          { id: "b", label: "Ana Paz" },
        ],
        scope: "portal",
      }),
    ).toContain("Ana Paz, Ana Paz");
  });
});
