import { describe, expect, test } from "vitest";

import {
  assertValidInternalUsername,
  isReservedInternalUsername,
} from "@/lib/auth/internal-username.server";

describe("internal username on the server", () => {
  test("returns the normalized value when it is valid", () => {
    expect(assertValidInternalUsername(" Admin.User_01 ")).toBe(
      "admin.user_01",
    );
  });

  test("throws on an invalid value", () => {
    expect(() => assertValidInternalUsername("josé")).toThrowError(
      "Invalid internal username.",
    );
  });

  test("reserves the routed addresses", () => {
    expect(isReservedInternalUsername("Acceso")).toBe(true);
    expect(isReservedInternalUsername("jurado")).toBe(false);
  });
});
