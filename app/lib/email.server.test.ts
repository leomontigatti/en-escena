import { beforeEach, describe, expect, test, vi } from "vitest";

const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: vi.fn(() => ({
    emails: {
      send: sendEmailMock,
    },
  })),
}));

const originalNodeEnv = process.env.NODE_ENV;
const originalResendApiKey = process.env.RESEND_API_KEY;
const originalEmailFrom = process.env.EMAIL_FROM;

describe("sendEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.NODE_ENV = originalNodeEnv;
    process.env.RESEND_API_KEY = originalResendApiKey;
    process.env.EMAIL_FROM = originalEmailFrom;
  });

  test("logs email contents outside production without provider credentials", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { sendEmail } = await import("@/lib/email.server");

    await sendEmail({
      to: "academia@example.com",
      subject: "Completá tu registro en En Escena",
      text: "Usá este enlace para registrar tu academia: http://localhost/registro/token",
    });

    expect(infoSpy).toHaveBeenCalledWith(
      [
        "[email:dev]",
        "To: academia@example.com",
        "Subject: Completá tu registro en En Escena",
        "Usá este enlace para registrar tu academia: http://localhost/registro/token",
      ].join("\n"),
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
    infoSpy.mockRestore();
  });

  test("sends production email through Resend", async () => {
    process.env.NODE_ENV = "production";
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "En Escena <acceso@example.com>";
    sendEmailMock.mockResolvedValue({ data: { id: "email_id" }, error: null });
    const { sendEmail } = await import("@/lib/email.server");

    await sendEmail({
      to: "usuario@example.com",
      subject: "Recuperá tu acceso a En Escena",
      text: "Usá este enlace para definir una nueva contraseña: https://example.com/recuperar",
    });

    expect(sendEmailMock).toHaveBeenCalledWith({
      from: "En Escena <acceso@example.com>",
      to: "usuario@example.com",
      subject: "Recuperá tu acceso a En Escena",
      text: "Usá este enlace para definir una nueva contraseña: https://example.com/recuperar",
    });
  });

  test("requires production Resend credentials", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_FROM = "En Escena <acceso@example.com>";
    const { sendEmail } = await import("@/lib/email.server");

    await expect(
      sendEmail({
        to: "usuario@example.com",
        subject: "Te invitaron a En Escena",
        text: "Usá este enlace para confirmar tu correo: https://example.com/invitacion/token",
      }),
    ).rejects.toThrow("RESEND_API_KEY is required to send production email");
  });

  test("logs provider errors without exposing the API key", async () => {
    process.env.NODE_ENV = "production";
    process.env.RESEND_API_KEY = "re_secret_should_not_be_logged";
    process.env.EMAIL_FROM = "En Escena <acceso@example.com>";
    sendEmailMock.mockResolvedValue({
      data: null,
      error: new Error("The sender domain is not verified"),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendEmail } = await import("@/lib/email.server");

    await expect(
      sendEmail({
        to: "usuario@example.com",
        subject: "Te invitaron a En Escena",
        text: "Usá este enlace para confirmar tu correo: https://example.com/invitacion/token",
      }),
    ).rejects.toThrow("Email provider failed to send message");

    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(
      "re_secret_should_not_be_logged",
    );
    expect(errorSpy).toHaveBeenCalledWith(
      "[email:provider:error]",
      expect.objectContaining({
        provider: "resend",
        error: {
          name: "Error",
          message: "The sender domain is not verified",
        },
      }),
    );
    errorSpy.mockRestore();
  });
});
