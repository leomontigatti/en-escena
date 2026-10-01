import { describe, expect, test } from "vitest";

import {
  rosterMatchHref,
  rosterNameWarningIntro,
} from "@/lib/roster/roster-name-duplicates";

describe("rosterNameWarningIntro", () => {
  test("names the traits a dancer of the reader's own academy shares", () => {
    expect(
      rosterNameWarningIntro({ kind: "dancer-name", scope: "portal" }),
    ).toBe(
      "Ya existe un bailarín con el mismo nombre y fecha de nacimiento en tu academia:",
    );
  });

  test("speaks of the academy in the third person from the panel", () => {
    expect(
      rosterNameWarningIntro({ kind: "dancer-name", scope: "admin" }),
    ).toBe(
      "Ya existe un bailarín con el mismo nombre y fecha de nacimiento en la academia:",
    );
  });

  test("leaves the birth date out for a professor", () => {
    expect(
      rosterNameWarningIntro({ kind: "professor-name", scope: "portal" }),
    ).toBe("Ya existe un profesor con el mismo nombre en tu academia:");
  });
});

describe("rosterMatchHref", () => {
  test("points at the match's page in the area the reader is in", () => {
    expect(rosterMatchHref({ kind: "dancer-name", scope: "portal" }, "a")).toBe(
      "/portal/bailarines/a",
    );
    expect(
      rosterMatchHref({ kind: "professor-name", scope: "portal" }, "a"),
    ).toBe("/portal/profesores/a");
    expect(rosterMatchHref({ kind: "dancer-name", scope: "admin" }, "a")).toBe(
      "/administracion/bailarines/a",
    );
    expect(
      rosterMatchHref({ kind: "professor-name", scope: "admin" }, "a"),
    ).toBe("/administracion/profesores/a");
  });
});
