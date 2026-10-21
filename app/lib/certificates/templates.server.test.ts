import { describe, expect, it } from "vitest";

import { certificateTemplateForEvent } from "./templates.server";

describe("certificateTemplateForEvent", () => {
  it("finds the template of the year the event starts in", () => {
    const template = certificateTemplateForEvent(
      new Date("2026-10-10T13:00:00Z"),
    );

    expect(template?.year).toBe(2026);
  });

  it("reads the year in Argentina, not in UTC", () => {
    // 23:00 on 31 December 2026 in Córdoba is already 2027 in UTC.
    expect(
      certificateTemplateForEvent(new Date("2027-01-01T02:00:00Z"))?.year,
    ).toBe(2026);
  });

  it("has no template for a year the designer has not drawn", () => {
    expect(
      certificateTemplateForEvent(new Date("2027-10-10T13:00:00Z")),
    ).toBeNull();
  });
});
