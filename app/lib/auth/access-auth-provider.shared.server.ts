export type CredentialUserInput = {
  email: string;
  password: string;
  request: Request;
};

export type EmailSignUpInput = CredentialUserInput & {
  redirectTo: string;
};

export type EmailSignUpResult = {
  headers: Headers;
  debugConfirmationTokenHash?: string;
};

export type EmailOtpConfirmationInput = {
  request: Request;
  tokenHash: string;
  type: "signup";
};

export type PasswordRecoveryOtpInput = {
  request: Request;
  redirectTo: string;
  tokenHash: string;
};

export type PasswordResetRequestInput = {
  email: string;
  redirectTo: string;
  request: Request;
};

export type PasswordRecoveryCodeInput = {
  code: string;
  request: Request;
  redirectTo: string;
};

export type PasswordRecoveryUpdateInput = {
  newPassword: string;
  request: Request;
};

export type HeadersResult = {
  headers: Headers;
};

export type PasswordResetRequestResult = HeadersResult & {
  debugRecoveryCode?: string;
};

export type PasswordRecoveryRedirectResult = HeadersResult & {
  redirectTo: string;
};

export type AccessSession = {
  session: {
    id: string | null;
    issuedAt: Date | null;
  };
  user: {
    email: string;
    id: string;
  };
};

export type VerifiedAccessIdentity = AccessSession & {
  headers: Headers;
};

export type AccessCredentialUser = {
  userId: string;
  headers: Headers;
};

export type AccessAuthProvider = {
  getAccessSession(request: Request): Promise<AccessSession | null>;
  getVerifiedAccessIdentity(
    request: Request,
  ): Promise<VerifiedAccessIdentity | null>;
  signInCredentialUser(
    input: CredentialUserInput,
  ): Promise<AccessCredentialUser>;
  signOutCurrentSession(request: Request): Promise<{ headers: Headers }>;
  startEmailSignUp(input: EmailSignUpInput): Promise<EmailSignUpResult>;
  deleteAccessUser(userId: string): Promise<void>;
  requestPasswordReset(
    input: PasswordResetRequestInput,
  ): Promise<PasswordResetRequestResult>;
  exchangePasswordRecoveryCode(
    input: PasswordRecoveryCodeInput,
  ): Promise<PasswordRecoveryRedirectResult>;
  verifyPasswordRecoveryOtp(
    input: PasswordRecoveryOtpInput,
  ): Promise<PasswordRecoveryRedirectResult>;
  updatePasswordForRecovery(
    input: PasswordRecoveryUpdateInput,
  ): Promise<HeadersResult>;
  confirmEmailOtp(input: EmailOtpConfirmationInput): Promise<{
    headers: Headers;
    userId: string;
  }>;
};

/**
 * The provider's refusal of a recovery link that is unknown, expired or already
 * used. It is the only failure the recovery flow expects: anything else the
 * provider throws is infrastructure, and is logged before it reads as the same
 * "invalid link" message.
 */
export class RecoveryLinkRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecoveryLinkRefusedError";
  }
}

/**
 * The provider's refusal of a sign-up confirmation link whose pending sign-up
 * is unknown, expired or already confirmed: the academy's to fix by signing up
 * again. Anything else is infrastructure, and is logged before the same page.
 */
export class SignUpConfirmationRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignUpConfirmationRefusedError";
  }
}
