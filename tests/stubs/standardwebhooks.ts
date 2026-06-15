export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

export class Webhook {
  static prefix = "whsec_";

  constructor(
    readonly secret: string | Uint8Array,
    readonly options?: { format?: "raw" },
  ) {}

  sign() {
    throw new WebhookVerificationError(
      "standardwebhooks is stubbed in database tests.",
    );
  }

  verify() {
    throw new WebhookVerificationError(
      "standardwebhooks is stubbed in database tests.",
    );
  }
}
