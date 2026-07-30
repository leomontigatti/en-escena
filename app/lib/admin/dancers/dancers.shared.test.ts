import { describe, expect, test } from "vitest";

import {
  readDancerParticipationFilter,
  readDancerStatusFilter,
  toDancerParticipationSearchValue,
  toDancerStatusSearchValue,
  type DancerParticipationFilter,
  type DancerStatusFilter,
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

describe("toDancerStatusSearchValue", () => {
  test("encodes 'active' as an absent parameter", () => {
    expect(toDancerStatusSearchValue("active")).toBeNull();
  });

  test("encodes the remaining statuses as search values", () => {
    expect(toDancerStatusSearchValue("archived")).toBe("archivados");
    expect(toDancerStatusSearchValue("all")).toBe("todos");
  });

  test("round-trips every status through the reader", () => {
    const statuses: DancerStatusFilter[] = ["active", "archived", "all"];

    for (const status of statuses) {
      expect(readDancerStatusFilter(toDancerStatusSearchValue(status))).toBe(
        status,
      );
    }
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
