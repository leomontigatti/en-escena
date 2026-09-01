import { describe, expect, test } from "vitest";

import {
  readDancerParticipationFilter,
  toDancerParticipationSearchValue,
  type DancerParticipationFilter,
} from "@/lib/admin/dancers/dancers.shared";

describe("toDancerParticipationSearchValue", () => {
  test("encodes 'all' as an absent parameter", () => {
    expect(toDancerParticipationSearchValue("all")).toBeNull();
  });

  test("encodes the remaining participations as search values", () => {
    expect(toDancerParticipationSearchValue("yes")).toBe("si");
    expect(toDancerParticipationSearchValue("no")).toBe("no");
  });
});

describe("readDancerParticipationFilter", () => {
  test("round-trips every participation through the encoder", () => {
    const participations: DancerParticipationFilter[] = ["yes", "no", "all"];

    for (const participation of participations) {
      expect(
        readDancerParticipationFilter(
          toDancerParticipationSearchValue(participation),
        ),
      ).toBe(participation);
    }
  });

  test("falls back to 'all' for absent and unknown values", () => {
    expect(readDancerParticipationFilter(null)).toBe("all");
    expect(readDancerParticipationFilter("")).toBe("all");
    expect(readDancerParticipationFilter("todos")).toBe("all");
    expect(readDancerParticipationFilter("SI")).toBe("all");
  });
});
