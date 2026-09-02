import { describe, expect, test } from "vitest";

import {
  classifyRosterPersonSelection,
  getRosterPersonRejectionMessage,
} from "@/lib/roster/roster-person-rejection";

const noLinkedPeople: ReadonlySet<string> = new Set();

function row(input: { id: string; active: boolean }) {
  return { id: input.id, active: input.active };
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

  test("rejects an archived person that is not already linked", () => {
    const result = classifyRosterPersonSelection({
      selectedIds: ["archived"],
      rows: [row({ id: "archived", active: false })],
      linkedPersonIds: noLinkedPeople,
    });

    expect(result.people).toEqual([]);
    expect(result.rejections).toEqual([
      { personId: "archived", cause: "archived" },
    ]);
  });

  test("accepts an archived person that is already linked to this choreography", () => {
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

  test("asks to reactivate the archived person, naming no one and picking the noun by kind", () => {
    expect(
      getRosterPersonRejectionMessage({
        kind: "dancer",
        rejections: [{ personId: "one", cause: "archived" }],
      }),
    ).toBe("Reactivá este bailarín para poder agregarlo a la coreografía.");
    expect(
      getRosterPersonRejectionMessage({
        kind: "professor",
        rejections: [{ personId: "one", cause: "archived" }],
      }),
    ).toBe("Reactivá este profesor para poder agregarlo a la coreografía.");
  });

  test("emits the archived sentence once however many archived people were picked", () => {
    expect(
      getRosterPersonRejectionMessage({
        kind: "professor",
        rejections: [
          { personId: "one", cause: "archived" },
          { personId: "two", cause: "archived" },
        ],
      }),
    ).toBe("Reactivá este profesor para poder agregarlo a la coreografía.");
  });

  test("states both causes when the selection mixes them", () => {
    expect(
      getRosterPersonRejectionMessage({
        kind: "dancer",
        rejections: [
          { personId: "one", cause: "not-found" },
          { personId: "two", cause: "archived" },
        ],
      }),
    ).toBe(
      "Reactivá este bailarín para poder agregarlo a la coreografía. Elegí bailarines que pertenezcan a tu academia.",
    );
  });
});
