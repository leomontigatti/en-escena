import { describe, expect, test } from "vitest";

import {
  readProfessorParticipationFilter,
  toProfessorParticipationSearchValue,
  type ProfessorParticipationFilter,
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
