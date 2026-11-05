import { describe, expect, test } from "vitest";

import { getEventStatus } from "@/lib/events/event-status";

const event = {
  startsAt: new Date("2026-10-29T12:00:00.000Z"),
  endsAt: new Date("2026-10-31T23:00:00.000Z"),
};

describe("getEventStatus", () => {
  test.each([
    ["before the start", "2026-10-29T11:59:59.999Z", "not-started"],
    ["exactly at the start", "2026-10-29T12:00:00.000Z", "in-progress"],
    ["between the dates", "2026-10-30T12:00:00.000Z", "in-progress"],
    ["exactly at the end", "2026-10-31T23:00:00.000Z", "in-progress"],
    ["after the end", "2026-10-31T23:00:00.001Z", "finished"],
  ])("%s", (_case, now, expected) => {
    expect(getEventStatus(event, new Date(now))).toBe(expected);
  });
});
