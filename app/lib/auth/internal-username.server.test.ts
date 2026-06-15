import { describe, expect, test } from "vitest";

import {
  assertValidInternalUsername,
  normalizeInternalUsername,
} from "@/lib/auth/internal-username.server";

describe("internal username", () => {
  test("normalizes valid values to lowercase", () => {
    expect(normalizeInternalUsername(" Admin.User_01 ")).toBe("admin.user_01");
  });

  test.each([
    "ab",
    "usuario con espacios",
    "josé",
    "usuario@example.com",
    "usuario@interno",
    "USER+PLUS",
  ])("rejects invalid values: %s", (value) => {
    expect(() => assertValidInternalUsername(value)).toThrowError(
      "Nombre de usuario interno inválido.",
    );
  });
});
