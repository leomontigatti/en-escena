import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { sendEmail } from "@/lib/shared/email.server";

const webhookSignatureToleranceMs = 5 * 60 * 1000;

const sendEmailHookPayloadSchema = z.object({
  user: z.object({
    email: z.email(),
  }),
  email_data: z.object({
    email_action_type: z.string(),
    redirect_to: z.string().optional().default(""),
    site_url: z.string().optional().default(""),
    token: z.string().optional().default(""),
    token_hash: z.string().optional().default(""),
  }),
});

type SendEmailHookPayload = z.infer<typeof sendEmailHookPayloadSchema>;

type AuthEmailTemplate = {
  subject: string;
  text: string;
};

export async function handleSupabaseSendEmailHook(request: Request) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const payload = await request.text();

  verifySupabaseHookSignature({
    headers: request.headers,
    payload,
  });

  const parsedPayload = sendEmailHookPayloadSchema.parse(JSON.parse(payload));
  const template = buildAuthEmailTemplate(parsedPayload);

  await sendEmail({
    to: parsedPayload.user.email,
    subject: template.subject,
    text: template.text,
  });

  return jsonResponse({}, 200);
}

function buildAuthEmailTemplate(
  payload: SendEmailHookPayload,
): AuthEmailTemplate {
  switch (payload.email_data.email_action_type) {
    case "signup":
      return buildSignupEmailTemplate(payload);
    case "recovery":
      return buildRecoveryEmailTemplate(payload);
    default:
      throw new Error("Unsupported Supabase auth email action.");
  }
}

function buildSignupEmailTemplate(
  payload: SendEmailHookPayload,
): AuthEmailTemplate {
  const actionUrl = buildAppAuthActionUrl(payload, {
    fallbackPath: "/registro/confirmar",
    type: "signup",
  });

  return {
    subject: "Confirmá tu correo en En Escena",
    text: [
      "Hola,",
      "",
      "Confirmá tu correo para seguir con el registro de tu academia en En Escena:",
      "",
      actionUrl,
      "",
      "Si no solicitaste este registro, no hace falta que hagas nada.",
      "",
      "El equipo de En Escena",
    ].join("\n"),
  };
}

function buildRecoveryEmailTemplate(
  payload: SendEmailHookPayload,
): AuthEmailTemplate {
  const actionUrl = buildAppAuthActionUrl(payload, {
    fallbackPath: "/cambiar-contrasena",
    type: "recovery",
  });

  return {
    subject: "Recuperá tu acceso a En Escena",
    text: [
      "Hola,",
      "",
      "Usá este enlace para definir una nueva contraseña de acceso a En Escena:",
      "",
      actionUrl,
      "",
      "Si no solicitaste recuperar tu acceso, no hace falta que hagas nada.",
      "",
      "El equipo de En Escena",
    ].join("\n"),
  };
}

function buildAppAuthActionUrl(
  payload: SendEmailHookPayload,
  input: { fallbackPath: string; type: "recovery" | "signup" },
) {
  const tokenHash = payload.email_data.token_hash;

  if (!tokenHash) {
    throw new Error("Supabase auth email hook payload is missing token_hash.");
  }

  const baseUrl = getHookRedirectUrl(payload, input.fallbackPath);

  baseUrl.searchParams.set("token_hash", tokenHash);
  baseUrl.searchParams.set("type", input.type);

  return baseUrl.toString();
}

function getHookRedirectUrl(
  payload: SendEmailHookPayload,
  fallbackPath: string,
) {
  const baseUrl = getHookBaseUrl(payload);

  baseUrl.pathname = fallbackPath;
  baseUrl.search = "";
  baseUrl.hash = "";

  return baseUrl;
}

function getHookBaseUrl(payload: SendEmailHookPayload) {
  const redirectTo = payload.email_data.redirect_to;

  if (redirectTo) {
    return new URL(redirectTo);
  }

  const siteUrl = payload.email_data.site_url;

  if (siteUrl) {
    return new URL(siteUrl);
  }

  return new URL(getRequiredHookEnv("APP_URL"));
}

function verifySupabaseHookSignature(input: {
  headers: Headers;
  payload: string;
}) {
  const webhookId = getRequiredHeader(input.headers, "webhook-id");
  const webhookTimestamp = getRequiredHeader(
    input.headers,
    "webhook-timestamp",
  );
  const webhookSignature = getRequiredHeader(
    input.headers,
    "webhook-signature",
  );
  const timestampMs = Number(webhookTimestamp) * 1000;

  if (
    !Number.isFinite(timestampMs) ||
    Math.abs(Date.now() - timestampMs) > webhookSignatureToleranceMs
  ) {
    throw new Error("Supabase auth email hook timestamp is invalid.");
  }

  const signedPayload = `${webhookId}.${webhookTimestamp}.${input.payload}`;
  const expectedSignature = createHmac("sha256", getSupabaseHookSecretBytes())
    .update(signedPayload)
    .digest();

  if (!hasMatchingSignature(webhookSignature, expectedSignature)) {
    throw new Error("Supabase auth email hook signature is invalid.");
  }
}

function hasMatchingSignature(headerValue: string, expectedSignature: Buffer) {
  return headerValue
    .split(" ")
    .flatMap((signaturePart) => signaturePart.split(","))
    .some((signatureValue) => {
      const normalizedSignature = signatureValue.trim();

      if (!normalizedSignature || normalizedSignature === "v1") {
        return false;
      }

      const actualSignature = Buffer.from(normalizedSignature, "base64");

      return (
        actualSignature.length === expectedSignature.length &&
        timingSafeEqual(actualSignature, expectedSignature)
      );
    });
}

function getSupabaseHookSecretBytes() {
  const secret = getRequiredHookEnv("SEND_EMAIL_HOOK_SECRET");
  const secretValue = secret.startsWith("v1,whsec_")
    ? secret.slice("v1,whsec_".length)
    : secret;

  return Buffer.from(secretValue, "base64");
}

function getRequiredHeader(headers: Headers, name: string) {
  const value = headers.get(name);

  if (!value) {
    throw new Error(`Supabase auth email hook is missing ${name}.`);
  }

  return value;
}

function getRequiredHookEnv(name: "APP_URL" | "SEND_EMAIL_HOOK_SECRET") {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for Supabase Send Email hook.`);
  }

  return value;
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json",
    },
    status,
  });
}
