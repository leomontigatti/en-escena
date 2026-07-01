import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, test, vi } from "vitest";

const sendEmail = vi.hoisted(() => vi.fn());

vi.mock("@/lib/shared/email.server", () => ({
  sendEmail,
}));

import { handleSupabaseSendEmailHook } from "@/lib/auth/send-email-hook.server";

const originalAppUrl = process.env.APP_URL;
const originalSendEmailHookSecret = process.env.SEND_EMAIL_HOOK_SECRET;

describe("Supabase Send Email auth hook", () => {
  beforeEach(() => {
    sendEmail.mockReset();
    process.env.APP_URL = originalAppUrl;
    process.env.SEND_EMAIL_HOOK_SECRET = originalSendEmailHookSecret;
  });

  test("sends a recovery email with a token_hash link that the app can verify", async () => {
    const request = createSignedHookRequest({
      user: {
        email: "academia@example.com",
      },
      email_data: {
        email_action_type: "recovery",
        redirect_to: "https://enescena.com.ar/cambiar-contrasena",
        token_hash: "hash-recuperacion",
      },
    });

    const response = await handleSupabaseSendEmailHook(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({});
    expect(sendEmail).toHaveBeenCalledWith({
      to: "academia@example.com",
      subject: "Recuperá tu acceso a En Escena",
      text: expect.stringContaining(
        "https://enescena.com.ar/cambiar-contrasena?token_hash=hash-recuperacion&type=recovery",
      ),
    });
  });

  test("sends a signup confirmation email with the academy onboarding callback", async () => {
    const request = createSignedHookRequest({
      user: {
        email: "nueva-academia@example.com",
      },
      email_data: {
        email_action_type: "signup",
        redirect_to: "https://enescena.com.ar/registro/confirmar",
        token_hash: "hash-confirmacion",
      },
    });

    const response = await handleSupabaseSendEmailHook(request);

    expect(response.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith({
      to: "nueva-academia@example.com",
      subject: "Confirmá tu correo en En Escena",
      text: expect.stringContaining(
        "https://enescena.com.ar/registro/confirmar?token_hash=hash-confirmacion&type=signup",
      ),
    });
  });

  test("forces the signup confirmation path when Supabase sends the site root as redirect", async () => {
    const request = createSignedHookRequest({
      user: {
        email: "nueva-academia@example.com",
      },
      email_data: {
        email_action_type: "signup",
        redirect_to: "https://sistema.enescena.com.ar",
        token_hash: "hash-confirmacion",
      },
    });

    const response = await handleSupabaseSendEmailHook(request);

    expect(response.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith({
      to: "nueva-academia@example.com",
      subject: "Confirmá tu correo en En Escena",
      text: expect.stringContaining(
        "https://sistema.enescena.com.ar/registro/confirmar?token_hash=hash-confirmacion&type=signup",
      ),
    });
  });

  test("forces the recovery path while preserving the redirect origin", async () => {
    const request = createSignedHookRequest({
      user: {
        email: "academia@example.com",
      },
      email_data: {
        email_action_type: "recovery",
        redirect_to:
          "https://sistema.enescena.com.ar/otra-ruta?utm_source=supabase",
        token_hash: "hash-recuperacion",
      },
    });

    const response = await handleSupabaseSendEmailHook(request);

    expect(response.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith({
      to: "academia@example.com",
      subject: "Recuperá tu acceso a En Escena",
      text: expect.stringContaining(
        "https://sistema.enescena.com.ar/cambiar-contrasena?token_hash=hash-recuperacion&type=recovery",
      ),
    });
  });

  test("uses APP_URL when Supabase does not send an explicit redirect URL", async () => {
    process.env.APP_URL = "https://sistema.enescena.com.ar";
    const request = createSignedHookRequest({
      user: {
        email: "academia@example.com",
      },
      email_data: {
        email_action_type: "recovery",
        site_url: "https://sistema.enescena.com.ar",
        token_hash: "hash-recuperacion",
      },
    });

    const response = await handleSupabaseSendEmailHook(request);

    expect(response.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith({
      to: "academia@example.com",
      subject: "Recuperá tu acceso a En Escena",
      text: expect.stringContaining(
        "https://sistema.enescena.com.ar/cambiar-contrasena?token_hash=hash-recuperacion&type=recovery",
      ),
    });
  });

  test("rejects unsigned hook requests before sending email", async () => {
    process.env.SEND_EMAIL_HOOK_SECRET = createHookSecret();
    const request = new Request(
      "https://enescena.com.ar/auth/hooks/send-email",
      {
        body: JSON.stringify({
          user: { email: "academia@example.com" },
          email_data: {
            email_action_type: "recovery",
            redirect_to: "https://enescena.com.ar/cambiar-contrasena",
            token_hash: "hash-recuperacion",
          },
        }),
        method: "POST",
      },
    );

    await expect(handleSupabaseSendEmailHook(request)).rejects.toThrow(
      "Supabase auth email hook is missing webhook-id.",
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

function createSignedHookRequest(payload: unknown) {
  const hookSecret = createHookSecret();
  const payloadText = JSON.stringify(payload);
  const webhookId = "msg_test";
  const webhookTimestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac(
    "sha256",
    Buffer.from(hookSecret.replace("v1,whsec_", ""), "base64"),
  )
    .update(`${webhookId}.${webhookTimestamp}.${payloadText}`)
    .digest("base64");

  process.env.SEND_EMAIL_HOOK_SECRET = hookSecret;

  return new Request("https://enescena.com.ar/auth/hooks/send-email", {
    body: payloadText,
    headers: {
      "content-type": "application/json",
      "webhook-id": webhookId,
      "webhook-signature": `v1,${signature}`,
      "webhook-timestamp": webhookTimestamp,
    },
    method: "POST",
  });
}

function createHookSecret() {
  return `v1,whsec_${Buffer.from("hook-secret").toString("base64")}`;
}
