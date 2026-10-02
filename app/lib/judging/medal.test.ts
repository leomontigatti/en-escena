import { describe, expect, test } from "vitest";

import {
  medalLabels,
  presentationAverage,
  medalForAverage,
} from "@/lib/judging/medal";

describe("a presentation's average", () => {
  test("is the mean of the values every judge left", () => {
    expect(
      presentationAverage({
        disqualified: false,
        scores: [{ value: "80.0" }, { value: "90.0" }],
      }),
    ).toBe(80 + 5);
  });

  test("rounds to two decimals", () => {
    expect(
      presentationAverage({
        disqualified: false,
        scores: [{ value: "80.0" }, { value: "85.5" }, { value: "90.0" }],
      }),
    ).toBe(85.17);
  });

  test("leaves out a score that has no value", () => {
    expect(
      presentationAverage({
        disqualified: false,
        scores: [{ value: null }, { value: "90.0" }],
      }),
    ).toBe(90);
  });

  test("is absent for a disqualified presentation, and when nothing counts", () => {
    expect(
      presentationAverage({
        disqualified: true,
        scores: [{ value: "90.0" }],
      }),
    ).toBeNull();
    expect(
      presentationAverage({ disqualified: false, scores: [{ value: null }] }),
    ).toBeNull();
    expect(presentationAverage({ disqualified: false, scores: [] })).toBeNull();
  });
});

describe("the medal read from that average", () => {
  test.each([
    [0, "specialMention"],
    [59.99, "specialMention"],
    [60, "bronze"],
    [79.99, "bronze"],
    [80, "silver"],
    [89.99, "silver"],
    [90, "gold"],
    [100, "gold"],
  ])("reads %s as %s", (average, medal) => {
    expect(medalForAverage(average)).toBe(medal);
  });

  test("names each medal as administration reads it", () => {
    expect(medalLabels.specialMention).toBe("Mención especial");
    expect(medalLabels.bronze).toBe("Medalla de bronce");
    expect(medalLabels.silver).toBe("Medalla de plata");
    expect(medalLabels.gold).toBe("Medalla de oro");
  });
});
