import { describe, expect, test } from "vitest";

import { countFittingBadges } from "./badges-list";

const row = { counterWidth: 30, gap: 8 };

describe("how many badges a folded row spells out", () => {
  test("all of them when they fit, with no room kept for a counter", () => {
    expect(
      countFittingBadges({ ...row, available: 216, widths: [100, 100] }),
    ).toBe(2);
  });

  test("as many as leave room for the counter when they do not", () => {
    // Two badges and the counter take 100 + 8 + 100 + 8 + 30 = 246.
    expect(
      countFittingBadges({ ...row, available: 300, widths: [100, 100, 100] }),
    ).toBe(2);
    expect(
      countFittingBadges({ ...row, available: 245, widths: [100, 100, 100] }),
    ).toBe(1);
  });

  test("keeps the first badge even when the column is narrower than it", () => {
    expect(
      countFittingBadges({ ...row, available: 50, widths: [100, 100] }),
    ).toBe(1);
  });

  test("has nothing to fold in an empty row", () => {
    expect(countFittingBadges({ ...row, available: 50, widths: [] })).toBe(0);
  });
});
