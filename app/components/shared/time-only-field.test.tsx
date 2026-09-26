import { describe, expect, test } from "vitest";

import { parseTimeOnlyValue } from "./time-only-field";

describe("parseTimeOnlyValue", () => {
  test("keeps only valid hour and minute values", () => {
    const options = {
      hourOptions: ["09", "10"],
      minuteOptions: ["00", "30"],
    };

    expect(parseTimeOnlyValue("09:30", options)).toEqual({
      hour: "09",
      minute: "30",
    });
    expect(parseTimeOnlyValue("25:61", options)).toEqual({
      hour: undefined,
      minute: undefined,
    });
  });
});
