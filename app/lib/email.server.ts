import { Resend } from "resend";

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

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

  const resend = getResendClient();
  const from = getRequiredEmailEnv("EMAIL_FROM");

  try {
    const { error } = await resend.emails.send({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
    });

    if (error) {
      logProviderError(input, error);
      throw new Error("Email provider failed to send message");
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Email provider failed to send message"
    ) {
      throw error;
    }

    logProviderError(input, error);
    throw new Error("Email provider failed to send message");
  }
}

function getResendClient() {
  if (!resendClient) {
    resendClient = new Resend(getRequiredEmailEnv("RESEND_API_KEY"));
  }

  return resendClient;
}

function getRequiredEmailEnv(name: "EMAIL_FROM" | "RESEND_API_KEY") {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required to send production email`);
  }

  return value;
}

function logProviderError(input: SendEmailInput, error: unknown) {
  console.error("[email:provider:error]", {
    provider: "resend",
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
      message: "Resend returned a non-standard error response",
    };
  }

  return {
    name: "ProviderError",
    message: String(error),
  };
}
