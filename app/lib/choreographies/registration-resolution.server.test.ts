import { describe, expect, test } from "vitest";

import { deriveGroupType } from "@/lib/choreographies/registration-resolution.server";

describe("deriveGroupType", () => {
  test("maps dancer counts to the shared group type used by admin re-resolution", () => {
    expect(deriveGroupType(1)).toBe("solo");
    expect(deriveGroupType(2)).toBe("duo");
    expect(deriveGroupType(3)).toBe("trio");
    expect(deriveGroupType(4)).toBe("grupal");
    expect(deriveGroupType(9)).toBe("grupal");
  });
});
