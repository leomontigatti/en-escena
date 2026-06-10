type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
};

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

  throw new Error("Email provider is not configured");
}
