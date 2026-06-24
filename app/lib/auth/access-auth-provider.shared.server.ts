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
  signUpCredentialUser(
    input: CredentialUserInput,
  ): Promise<AccessCredentialUser>;
  startEmailSignUp(input: EmailSignUpInput): Promise<EmailSignUpResult>;
  deleteAccessUser(userId: string): Promise<void>;
  requestPasswordReset(input: {
    email: string;
    redirectTo: string;
    request: Request;
  }): Promise<{ headers: Headers; debugRecoveryCode?: string }>;
  exchangePasswordRecoveryCode(input: {
    code: string;
    request: Request;
    redirectTo: string;
  }): Promise<{ headers: Headers; redirectTo: string }>;
  verifyPasswordRecoveryOtp(
    input: PasswordRecoveryOtpInput,
  ): Promise<{ headers: Headers; redirectTo: string }>;
  updatePasswordForRecovery(input: {
    newPassword: string;
    request: Request;
  }): Promise<{ headers: Headers }>;
  confirmEmailOtp(input: EmailOtpConfirmationInput): Promise<{
    headers: Headers;
    userId: string;
  }>;
};

export function isTestAccessAuthMode() {
  return process.env.NODE_ENV === "test" || process.env.VITEST === "true";
}
