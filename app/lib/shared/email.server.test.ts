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
const originalEmailProvider = process.env.EMAIL_PROVIDER;
const originalResendApiKey = process.env.RESEND_API_KEY;
const originalBrevoApiKey = process.env.BREVO_API_KEY;
const originalEmailFrom = process.env.EMAIL_FROM;

describe("sendEmail", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    process.env.NODE_ENV = originalNodeEnv;
    process.env.EMAIL_PROVIDER = originalEmailProvider;
    process.env.RESEND_API_KEY = originalResendApiKey;
    process.env.BREVO_API_KEY = originalBrevoApiKey;
    process.env.EMAIL_FROM = originalEmailFrom;
  });

  test("logs email contents outside production without provider credentials", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.EMAIL_PROVIDER;
    delete process.env.RESEND_API_KEY;
    delete process.env.BREVO_API_KEY;
    delete process.env.EMAIL_FROM;
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const { sendEmail } = await import("@/lib/shared/email.server");

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
    delete process.env.EMAIL_PROVIDER;
    process.env.RESEND_API_KEY = "re_test";
    process.env.EMAIL_FROM = "En Escena <acceso@example.com>";
    sendEmailMock.mockResolvedValue({ data: { id: "email_id" }, error: null });
    const { sendEmail } = await import("@/lib/shared/email.server");

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

  test("sends production email through Brevo when selected", async () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_PROVIDER = "brevo";
    process.env.BREVO_API_KEY = "xkeysib-test";
    process.env.EMAIL_FROM = "En Escena <acceso@example.com>";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const { sendEmail } = await import("@/lib/shared/email.server");

    await sendEmail({
      to: "usuario@example.com",
      subject: "Te invitaron a En Escena",
      text: "Usá este enlace para confirmar tu correo: https://example.com/invitacion/token",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": "xkeysib-test",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "En Escena", email: "acceso@example.com" },
          to: [{ email: "usuario@example.com" }],
          subject: "Te invitaron a En Escena",
          textContent:
            "Usá este enlace para confirmar tu correo: https://example.com/invitacion/token",
        }),
      },
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  test("requires production Resend credentials", async () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_PROVIDER = "resend";
    delete process.env.RESEND_API_KEY;
    process.env.EMAIL_FROM = "En Escena <acceso@example.com>";
    const { sendEmail } = await import("@/lib/shared/email.server");

    await expect(
      sendEmail({
        to: "usuario@example.com",
        subject: "Te invitaron a En Escena",
        text: "Usá este enlace para confirmar tu correo: https://example.com/invitacion/token",
      }),
    ).rejects.toThrow("RESEND_API_KEY is required to send production email");
  });

  test("requires production Brevo credentials", async () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_PROVIDER = "brevo";
    delete process.env.BREVO_API_KEY;
    process.env.EMAIL_FROM = "En Escena <acceso@example.com>";
    const { sendEmail } = await import("@/lib/shared/email.server");

    await expect(
      sendEmail({
        to: "usuario@example.com",
        subject: "Te invitaron a En Escena",
        text: "Usá este enlace para confirmar tu correo: https://example.com/invitacion/token",
      }),
    ).rejects.toThrow("BREVO_API_KEY is required to send production email");
  });

  test("logs provider errors without exposing the API key", async () => {
    process.env.NODE_ENV = "production";
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_secret_should_not_be_logged";
    process.env.EMAIL_FROM = "En Escena <acceso@example.com>";
    sendEmailMock.mockResolvedValue({
      data: null,
      error: new Error("The sender domain is not verified"),
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { sendEmail } = await import("@/lib/shared/email.server");

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
