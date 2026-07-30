import { describe, expect, test } from "vitest";

import {
  readProfessorParticipationFilter,
  readProfessorStatusFilter,
  toProfessorParticipationSearchValue,
  toProfessorStatusSearchValue,
  type ProfessorParticipationFilter,
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

describe("readProfessorParticipationFilter", () => {
  test("round-trips every participation through the encoder", () => {
    const participations: ProfessorParticipationFilter[] = ["yes", "no", "all"];

    for (const participation of participations) {
      expect(
        readProfessorParticipationFilter(
          toProfessorParticipationSearchValue(participation),
        ),
      ).toBe(participation);
    }
  });

  test("falls back to 'all' for absent and unknown values", () => {
    expect(readProfessorParticipationFilter(null)).toBe("all");
    expect(readProfessorParticipationFilter("")).toBe("all");
    expect(readProfessorParticipationFilter("todos")).toBe("all");
    expect(readProfessorParticipationFilter("SI")).toBe("all");
  });
});
