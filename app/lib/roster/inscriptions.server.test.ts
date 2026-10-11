import { describe, expect, test } from "vitest";

import {
  findProfessorChoreographies,
  findRosterSeminarInscriptions,
} from "@/lib/roster/inscriptions.server";

// With no event selected both reads answer before any query: one that reached
// the database would throw here, where none is configured.
describe("findRosterSeminarInscriptions", () => {
  test("reads nothing without a selected event", async () => {
    await expect(
      findRosterSeminarInscriptions({
        person: { id: crypto.randomUUID(), kind: "dancer" },
        selectedEventId: null,
      }),
    ).resolves.toEqual([]);
  });
});

describe("findProfessorChoreographies", () => {
  test("reads nothing without a selected event", async () => {
    await expect(
      findProfessorChoreographies({
        professorId: crypto.randomUUID(),
        selectedEventId: null,
      }),
    ).resolves.toEqual([]);
  });
});
