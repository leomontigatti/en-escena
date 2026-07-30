import { describe, expect, test } from "vitest";

import {
  readProfessorStatusFilter,
  toProfessorParticipationSearchValue,
  toProfessorStatusSearchValue,
  type ProfessorStatusFilter,
} from "@/lib/admin/professors/professors.shared";

describe("toProfessorParticipationSearchValue", () => {
  test("encodes 'all' as an absent parameter", () => {
    expect(toProfessorParticipationSearchValue("all")).toBeNull();
  });

  test("encodes the remaining participations as search values", () => {
    expect(toProfessorParticipationSearchValue("yes")).toBe("si");
    expect(toProfessorParticipationSearchValue("no")).toBe("no");
  });
});

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
