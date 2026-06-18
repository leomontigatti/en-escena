import { Resend } from "resend";

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

type EmailProvider = "brevo" | "resend";

let resendClient: Resend | undefined;

export async function sendEmail(input: SendEmailInput) {
  if (process.env.NODE_ENV !== "production") {
    console.info(
      [
        "[email:dev]",
        `To: ${input.to}`,
        `Subject: ${input.subject}`,
        input.text,
      ].join("\n"),
    );
    return;
  }

  try {
    await sendProductionEmail(input);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Email provider failed to send message" ||
        isEmailConfigurationError(error))
    ) {
      throw error;
    }

    logProviderError(input, error, getEmailProvider());
    throw new Error("Email provider failed to send message");
  }
}

async function sendProductionEmail(input: SendEmailInput) {
  const provider = getEmailProvider();

  if (provider === "brevo") {
    await sendBrevoEmail(input);
    return;
  }

  await sendResendEmail(input);
}

async function sendResendEmail(input: SendEmailInput) {
  const resend = getResendClient();
  const from = getRequiredEmailEnv("EMAIL_FROM");
  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
  });

  if (error) {
    throw error;
  }
}

async function sendBrevoEmail(input: SendEmailInput) {
  const from = parseEmailFrom(getRequiredEmailEnv("EMAIL_FROM"));
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": getRequiredEmailEnv("BREVO_API_KEY"),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: from,
      to: [{ email: input.to }],
      subject: input.subject,
      textContent: input.text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Brevo returned HTTP ${response.status}`);
  }
}

function getResendClient() {
  if (!resendClient) {
    resendClient = new Resend(getRequiredEmailEnv("RESEND_API_KEY"));
  }

  return resendClient;
}

function getEmailProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER ?? "resend";

  if (provider === "brevo" || provider === "resend") {
    return provider;
  }

  throw new Error("EMAIL_PROVIDER must be either brevo or resend");
}

function getRequiredEmailEnv(
  name: "BREVO_API_KEY" | "EMAIL_FROM" | "RESEND_API_KEY",
) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required to send production email`);
  }

  return value;
}

function isEmailConfigurationError(error: Error) {
  return (
    error.message.endsWith(" is required to send production email") ||
    error.message === "EMAIL_PROVIDER must be either brevo or resend"
  );
}

function parseEmailFrom(value: string) {
  const parsed = /^(?<name>.+?)\s*<(?<email>[^<>]+)>$/.exec(value.trim());

  if (!parsed?.groups) {
    return { email: value.trim() };
  }

  return {
    name: parsed.groups.name.trim().replace(/^"|"$/g, ""),
    email: parsed.groups.email.trim(),
  };
}

function logProviderError(
  input: SendEmailInput,
  error: unknown,
  provider: EmailProvider,
) {
  console.error("[email:provider:error]", {
    provider,
    to: input.to,
    subject: input.subject,
    error: serializeProviderError(error),
  });
}

function serializeProviderError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }

  if (typeof error === "object" && error) {
    return {
      name: "ProviderError",
      message: "Email provider returned a non-standard error response",
    };
  }

  return {
    name: "ProviderError",
    message: String(error),
  };
}
