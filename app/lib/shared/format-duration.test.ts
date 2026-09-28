import { describe, expect, test } from "vitest";

import { formatDuration } from "./format-duration";

describe("formatDuration", () => {
  test("reads a position as minutes and seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65_400)).toBe("1:05");
    expect(formatDuration(180_000)).toBe("3:00");
  });
});
