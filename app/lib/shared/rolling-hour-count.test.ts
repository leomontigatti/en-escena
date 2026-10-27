import { describe, expect, test } from "vitest";

import { createRollingHourCount } from "./rolling-hour-count";

const MINUTE_MS = 60 * 1000;

describe("createRollingHourCount", () => {
  test("counts what was added in the last hour and forgets older additions", () => {
    let now = Date.parse("2026-10-26T01:00:00.000Z");
    const count = createRollingHourCount({ now: () => now });

    count.add();
    count.add();
    now += 30 * MINUTE_MS;
    count.add();

    expect(count.lastHour()).toBe(3);

    now += 31 * MINUTE_MS;

    expect(count.lastHour()).toBe(1);

    now += 30 * MINUTE_MS;

    expect(count.lastHour()).toBe(0);
  });
});
