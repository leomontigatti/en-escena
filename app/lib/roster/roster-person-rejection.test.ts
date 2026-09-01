import { describe, expect, test } from "vitest";

import {
  classifyRosterPersonSelection,
  getRosterPersonRejectionMessage,
} from "@/lib/roster/roster-person-rejection";

const noLinkedPeople: ReadonlySet<string> = new Set();

function row(input: { id: string; active: boolean; firstName?: string }) {
  return {
    id: input.id,
    active: input.active,
    firstName: input.firstName ?? "Ana",
    lastName: "Pérez",
  };
}

describe("classifyRosterPersonSelection", () => {
  test("accepts every active person and keeps the selected order", () => {
    const result = classifyRosterPersonSelection({
      selectedIds: ["second", "first"],
      rows: [
        row({ id: "first", active: true }),
        row({ id: "second", active: true }),
      ],
      linkedPersonIds: noLinkedPeople,
    });

    expect(result.rejections).toEqual([]);
    expect(result.people.map((person) => person.id)).toEqual([
      "second",
      "first",
    ]);
  });

  test("rejects an archived person that is not already linked, and names them", () => {
    const result = classifyRosterPersonSelection({
      selectedIds: ["archived"],
      rows: [row({ id: "archived", active: false, firstName: "Lucía" })],
      linkedPersonIds: noLinkedPeople,
    });

    expect(result.people).toEqual([]);
    expect(result.rejections).toEqual([
      { personId: "archived", cause: "archived", fullName: "Lucía Pérez" },
    ]);
  });

  test("accepts an archived person that is already linked to this coreografía", () => {
    const result = classifyRosterPersonSelection({
      selectedIds: ["archived"],
      rows: [row({ id: "archived", active: false })],
      linkedPersonIds: new Set(["archived"]),
    });

    expect(result.rejections).toEqual([]);
    expect(result.people.map((person) => person.id)).toEqual(["archived"]);
  });

  test("rejects a person whose row was not read as not-found", () => {
    const result = classifyRosterPersonSelection({
      selectedIds: ["missing"],
      rows: [],
      linkedPersonIds: noLinkedPeople,
    });

    expect(result.rejections).toEqual([
      { personId: "missing", cause: "not-found" },
    ]);
  });
});

describe("getRosterPersonRejectionMessage", () => {
  test("keeps a generic wording for not-found, without revealing whether the person exists", () => {
    expect(
      getRosterPersonRejectionMessage({
        kind: "dancer",
        rejections: [{ personId: "missing", cause: "not-found" }],
      }),
    ).toBe("Elegí bailarines que pertenezcan a tu academia.");
    expect(
      getRosterPersonRejectionMessage({
        kind: "professor",
        rejections: [{ personId: "missing", cause: "not-found" }],
      }),
    ).toBe("Elegí profesores que pertenezcan a tu academia.");
  });

  test("names the archived person and asks to reactivate them", () => {
    expect(
      getRosterPersonRejectionMessage({
        kind: "dancer",
        rejections: [
          { personId: "one", cause: "archived", fullName: "Lucía Pérez" },
        ],
      }),
    ).toBe(
      "Lucía Pérez está archivado. Reactivalo para poder agregarlo a la coreografía.",
    );
  });

  test("names every archived person when more than one was picked", () => {
    expect(
      getRosterPersonRejectionMessage({
        kind: "professor",
        rejections: [
          { personId: "one", cause: "archived", fullName: "Lucía Pérez" },
          { personId: "two", cause: "archived", fullName: "Juan Gómez" },
        ],
      }),
    ).toBe(
      "Lucía Pérez y Juan Gómez están archivados. Reactivalos para poder agregarlos a la coreografía.",
    );
  });

  test("states both causes when the selection mixes them", () => {
    expect(
      getRosterPersonRejectionMessage({
        kind: "dancer",
        rejections: [
          { personId: "one", cause: "not-found" },
          { personId: "two", cause: "archived", fullName: "Lucía Pérez" },
        ],
      }),
    ).toBe(
      "Lucía Pérez está archivado. Reactivalo para poder agregarlo a la coreografía. Elegí bailarines que pertenezcan a tu academia.",
    );
  });
});
