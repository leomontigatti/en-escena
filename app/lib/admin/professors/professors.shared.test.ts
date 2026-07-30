import { describe, expect, test } from "vitest";

import {
  readProfessorParticipationFilter,
  readProfessorStatusFilter,
  toProfessorParticipationSearchValue,
  toProfessorStatusSearchValue,
  type ProfessorParticipationFilter,
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

  test("round-trips every participation through the reader", () => {
    const participations: ProfessorParticipationFilter[] = ["yes", "no", "all"];

    for (const participation of participations) {
      expect(
        readProfessorParticipationFilter({
          value: toProfessorParticipationSearchValue(participation),
        }),
      ).toBe(participation);
    }
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
