import { describe, expect, test } from "vitest";

import {
  getRosterPersonStatusBadgeVariant,
  isSelectableForRoster,
  getRosterPersonStatusLabel,
  readRosterPersonStatusFilter,
  toRosterPersonStatus,
  toRosterPersonStatusSearchValue,
  type RosterPersonStatusFilter,
} from "@/lib/roster/roster-person-status.shared";

function searchParams(search: string) {
  return new URLSearchParams(search);
}

describe("toRosterPersonStatus", () => {
  test("derives the status from the stored boolean", () => {
    expect(toRosterPersonStatus(true)).toBe("active");
    expect(toRosterPersonStatus(false)).toBe("archived");
  });
});

describe("readRosterPersonStatusFilter", () => {
  test("reads an absent parameter as 'active'", () => {
    expect(readRosterPersonStatusFilter(searchParams(""))).toBe("active");
  });

  test("reads the two explicit values", () => {
    expect(
      readRosterPersonStatusFilter(searchParams("estado=archivados")),
    ).toBe("archived");
    expect(readRosterPersonStatusFilter(searchParams("estado=todos"))).toBe(
      "all",
    );
  });

  test("falls back to 'active' for an unknown value", () => {
    expect(readRosterPersonStatusFilter(searchParams("estado="))).toBe(
      "active",
    );
    expect(readRosterPersonStatusFilter(searchParams("estado=activos"))).toBe(
      "active",
    );
    expect(
      readRosterPersonStatusFilter(searchParams("estado=ARCHIVADOS")),
    ).toBe("active");
  });
});

describe("toRosterPersonStatusSearchValue", () => {
  test("encodes 'active' as an absent parameter", () => {
    expect(toRosterPersonStatusSearchValue("active")).toBeNull();
  });

  test("encodes the remaining filters as search values", () => {
    expect(toRosterPersonStatusSearchValue("archived")).toBe("archivados");
    expect(toRosterPersonStatusSearchValue("all")).toBe("todos");
  });

  test("round-trips every filter through the reader", () => {
    const filters: RosterPersonStatusFilter[] = ["active", "archived", "all"];

    for (const filter of filters) {
      const value = toRosterPersonStatusSearchValue(filter);
      const params = new URLSearchParams();

      if (value !== null) {
        params.set("estado", value);
      }

      expect(readRosterPersonStatusFilter(params)).toBe(filter);
    }
  });
});

describe("rosterPersonStatus labels", () => {
  test("names the two states once, for every surface", () => {
    expect(getRosterPersonStatusLabel("active")).toBe("Activo");
    expect(getRosterPersonStatusLabel("archived")).toBe("Archivado");
    expect(getRosterPersonStatusBadgeVariant("active")).toBe("success");
    expect(getRosterPersonStatusBadgeVariant("archived")).toBe("destructive");
  });
});

describe("isSelectableForRoster", () => {
  test.each([
    { status: "active", isAlreadyLinked: false, selectable: true },
    { status: "active", isAlreadyLinked: true, selectable: true },
    { status: "archived", isAlreadyLinked: true, selectable: true },
    { status: "archived", isAlreadyLinked: false, selectable: false },
  ] as const)(
    "a $status person already linked=$isAlreadyLinked is selectable=$selectable",
    ({ status, isAlreadyLinked, selectable }) => {
      expect(isSelectableForRoster({ status, isAlreadyLinked })).toBe(
        selectable,
      );
    },
  );
});
