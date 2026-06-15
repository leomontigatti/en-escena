import { describe, expect, test } from "vitest";

import {
  createRegistrationToken,
  hashRegistrationToken,
  normalizeEmail,
} from "@/lib/academies/registration-token.server";

describe("academy registration helpers", () => {
  test("normalizes email input", () => {
    expect(normalizeEmail("  Academia@Example.COM ")).toBe(
      "academia@example.com",
    );
  });

  test("hashes tokens without returning the raw token", () => {
    const token = "registration-token";
    const hash = hashRegistrationToken(token);

    expect(hash).toHaveLength(64);
    expect(hash).not.toBe(token);
    expect(hashRegistrationToken(token)).toBe(hash);
  });

  test("creates URL-safe registration tokens", () => {
    const token = createRegistrationToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThan(32);
  });
});
