import { describe, expect, test } from "vitest";

import {
  isValidInternalUsername,
  normalizeInternalUsername,
} from "@/lib/auth/internal-username.shared";

describe("internal username", () => {
  test("normalizes valid values to lowercase", () => {
    expect(normalizeInternalUsername(" Admin.User_01 ")).toBe("admin.user_01");
    expect(isValidInternalUsername(" Admin.User_01 ")).toBe(true);
  });

  test.each([
    "ab",
    "usuario con espacios",
    "josé",
    "usuario@example.com",
    "usuario@interno",
    "USER+PLUS",
    "!@#!%&*",
  ])("rejects invalid values: %s", (value) => {
    expect(isValidInternalUsername(value)).toBe(false);
  });
});
