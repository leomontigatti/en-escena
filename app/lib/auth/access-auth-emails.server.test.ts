import { beforeEach, describe, expect, test, vi } from "vitest";

const sentEmails = vi.hoisted(
  () =>
    [] as Array<{
      to: string;
      subject: string;
      text: string;
    }>,
);

vi.mock("@/lib/shared/email.server", () => ({
  sendEmail: vi.fn(async (input) => {
    sentEmails.push(input);
  }),
}));

import {
  buildAccessRecoveryLink,
  buildAcademySignUpConfirmationLink,
  sendAccessRecoveryEmail,
  sendAcademySignUpConfirmationEmail,
} from "@/lib/auth/access-auth-emails.server";

describe("access auth emails", () => {
  beforeEach(() => {
    sentEmails.length = 0;
  });

  test("builds the academy sign-up confirmation link the /registro/confirmar loader consumes", () => {
    const link = buildAcademySignUpConfirmationLink({
      redirectTo: "https://sistema.enescena.com.ar/registro/confirmar",
      tokenHash: "hash-confirmacion",
    });

    expect(link).toBe(
      "https://sistema.enescena.com.ar/registro/confirmar?token_hash=hash-confirmacion&type=signup",
    );
  });

  test("builds the recovery link from the Better Auth reset URL callback", () => {
    const link = buildAccessRecoveryLink({
      resetUrl:
        "https://sistema.enescena.com.ar/api/auth/reset-password/tok-123?callbackURL=https%3A%2F%2Fsistema.enescena.com.ar%2Fcambiar-contrasena",
      fallbackBaseUrl: "https://sistema.enescena.com.ar",
      token: "tok-123",
    });

    expect(link).toBe(
      "https://sistema.enescena.com.ar/cambiar-contrasena?code=tok-123",
    );
  });

  test("falls back to the base URL when the reset URL has no callback", () => {
    const link = buildAccessRecoveryLink({
      resetUrl: "https://sistema.enescena.com.ar/api/auth/reset-password/tok-9",
      fallbackBaseUrl: "https://sistema.enescena.com.ar/cambiar-contrasena",
      token: "tok-9",
    });

    expect(link).toBe(
      "https://sistema.enescena.com.ar/cambiar-contrasena?code=tok-9",
    );
  });

  test("sends the sign-up confirmation email in Spanish", async () => {
    await sendAcademySignUpConfirmationEmail({
      to: "nueva-academia@example.com",
      confirmationUrl:
        "https://sistema.enescena.com.ar/registro/confirmar?token_hash=hash&type=signup",
    });

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toMatchObject({
      to: "nueva-academia@example.com",
      subject: "Confirmá tu correo en En Escena",
    });
    expect(sentEmails[0].text).toContain(
      "https://sistema.enescena.com.ar/registro/confirmar?token_hash=hash&type=signup",
    );
  });

  test("sends the recovery email in Spanish", async () => {
    await sendAccessRecoveryEmail({
      to: "academia@example.com",
      recoveryUrl:
        "https://sistema.enescena.com.ar/cambiar-contrasena?code=tok",
    });

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0]).toMatchObject({
      to: "academia@example.com",
      subject: "Recuperá tu acceso a En Escena",
    });
    expect(sentEmails[0].text).toContain(
      "https://sistema.enescena.com.ar/cambiar-contrasena?code=tok",
    );
  });
});
