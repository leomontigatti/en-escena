import { describe, expect, test, vi } from "vitest";

import {
  createRegistrationToken,
  hashRegistrationToken,
  normalizeEmail,
} from "@/lib/academies/registration-token.server";
import { startAcademyRegistration } from "@/lib/academies/registration.server";

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

  test("starts Supabase signup with the confirmation redirect", async () => {
    const startSignUp = vi.fn(async () => ({
      headers: new Headers(),
    }));

    const result = await startAcademyRegistration({
      email: "  Academia@Example.COM ",
      password: "password-segura",
      request: new Request("http://localhost/registro", {
        method: "POST",
      }),
      requestUrl: "http://localhost/registro",
      isRegistrationEligible: async () => true,
      startAcademyUserSignUp: startSignUp,
    });

    expect(result).toEqual({
      headers: new Headers(),
      message:
        "Si el correo puede registrarse, enviamos un enlace para confirmar la cuenta y seguir con el alta.",
    });
    expect(startSignUp).toHaveBeenCalledWith({
      email: "academia@example.com",
      password: "password-segura",
      redirectTo: "http://localhost/registro/confirmar",
      request: expect.any(Request),
    });
  });

  test("keeps the public response generic when the email already exists", async () => {
    const startSignUp = vi.fn();

    const result = await startAcademyRegistration({
      email: "existente@example.com",
      password: "password-segura",
      request: new Request("http://localhost/registro", {
        method: "POST",
      }),
      requestUrl: "http://localhost/registro",
      isRegistrationEligible: async () => false,
      startAcademyUserSignUp: startSignUp,
    });

    expect(result).toEqual({
      headers: new Headers(),
      message:
        "Si el correo puede registrarse, enviamos un enlace para confirmar la cuenta y seguir con el alta.",
    });
    expect(startSignUp).not.toHaveBeenCalled();
  });

  test("keeps the public response generic when Supabase reports a duplicate email", async () => {
    const startSignUp = vi.fn(async () => {
      throw new Error("user_already_exists", {
        cause: { code: "user_already_exists" },
      });
    });

    const result = await startAcademyRegistration({
      email: "duplicado@example.com",
      password: "password-segura",
      request: new Request("http://localhost/registro", {
        method: "POST",
      }),
      requestUrl: "http://localhost/registro",
      isRegistrationEligible: async () => true,
      startAcademyUserSignUp: startSignUp,
    });

    expect(result).toEqual({
      headers: new Headers(),
      message:
        "Si el correo puede registrarse, enviamos un enlace para confirmar la cuenta y seguir con el alta.",
    });
  });
});
