import { describe, expect, it } from "vitest";

import { getBusinessDateOnly, getBusinessTimeOnly } from "./business-time-zone";

describe("getBusinessDateOnly", () => {
  it("reads the date in business time, not UTC, after 21:00", () => {
    expect(getBusinessDateOnly(new Date("2026-10-16T01:30:00Z"))).toBe(
      "2026-10-15",
    );
  });

  it("turns the date at business midnight", () => {
    expect(getBusinessDateOnly(new Date("2026-10-16T03:00:00Z"))).toBe(
      "2026-10-16",
    );
  });
});

describe("getBusinessTimeOnly", () => {
  it("reads the time in business time on a 24-hour clock", () => {
    expect(getBusinessTimeOnly(new Date("2026-10-16T02:05:00Z"))).toBe("23:05");
    expect(getBusinessTimeOnly(new Date("2026-10-16T03:00:00Z"))).toBe("00:00");
  });
});
