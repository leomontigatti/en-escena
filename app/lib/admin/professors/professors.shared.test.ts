import { describe, expect, test } from "vitest";

import {
  readProfessorStatusFilter,
  toProfessorStatusSearchValue,
  type ProfessorStatusFilter,
} from "@/lib/admin/professors/professors.shared";

describe("toProfessorStatusSearchValue", () => {
  test("encodes 'active' as an absent parameter", () => {
    expect(toProfessorStatusSearchValue("active")).toBeNull();
  });

  test("encodes the remaining statuses as search values", () => {
    expect(toProfessorStatusSearchValue("archived")).toBe("archivados");
    expect(toProfessorStatusSearchValue("all")).toBe("todos");
  });

  test("round-trips every status through the reader", () => {
    const statuses: ProfessorStatusFilter[] = ["active", "archived", "all"];

    for (const status of statuses) {
      expect(
        readProfessorStatusFilter(toProfessorStatusSearchValue(status)),
      ).toBe(status);
    }
  });
});
