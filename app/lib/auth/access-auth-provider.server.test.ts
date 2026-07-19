import { afterEach, describe, expect, test, vi } from "vitest";

const createLocalTestAccessAuthProvider = vi.hoisted(() => vi.fn());
const createSupabaseAccessAuthProvider = vi.hoisted(() => vi.fn());

const localAdapter = {
  confirmEmailOtp: vi.fn(),
  deleteAccessUser: vi.fn(),
  exchangePasswordRecoveryCode: vi.fn(),
  getAccessSession: vi.fn(),
  getVerifiedAccessIdentity: vi.fn(),
  requestPasswordReset: vi.fn(),
  signInCredentialUser: vi.fn(),
  signOutCurrentSession: vi.fn(),
  signUpCredentialUser: vi.fn(),
  startEmailSignUp: vi.fn(),
  updatePasswordForRecovery: vi.fn(),
  verifyPasswordRecoveryOtp: vi.fn(),
};

const supabaseAdapter = {
  confirmEmailOtp: vi.fn(),
  deleteAccessUser: vi.fn(),
  exchangePasswordRecoveryCode: vi.fn(),
  getAccessSession: vi.fn(),
  getVerifiedAccessIdentity: vi.fn(),
  requestPasswordReset: vi.fn(),
  signInCredentialUser: vi.fn(),
  signOutCurrentSession: vi.fn(),
  signUpCredentialUser: vi.fn(),
  startEmailSignUp: vi.fn(),
  updatePasswordForRecovery: vi.fn(),
  verifyPasswordRecoveryOtp: vi.fn(),
};

vi.mock("@/lib/auth/access-auth-provider.local.server", () => ({
  createLocalTestAccessAuthProvider,
}));

vi.mock("@/lib/auth/access-auth-provider.supabase.server", () => ({
  createSupabaseAccessAuthProvider,
}));

describe("accessAuthProvider", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
    createLocalTestAccessAuthProvider.mockReset();
    createSupabaseAccessAuthProvider.mockReset();
  });

  test("selects the local test adapter once in test auth mode", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VITEST", "true");
    createLocalTestAccessAuthProvider.mockReturnValue(localAdapter);
    createSupabaseAccessAuthProvider.mockReturnValue(supabaseAdapter);

    const { accessAuthProvider } = await import(
      "@/lib/auth/access-auth-provider.server"
    );

    expect(accessAuthProvider).toBe(localAdapter);
    expect(createLocalTestAccessAuthProvider).toHaveBeenCalledTimes(1);
    expect(createSupabaseAccessAuthProvider).not.toHaveBeenCalled();
  });

  test("selects the Supabase adapter once outside test auth mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITEST", "false");
    createLocalTestAccessAuthProvider.mockReturnValue(localAdapter);
    createSupabaseAccessAuthProvider.mockReturnValue(supabaseAdapter);

    const { accessAuthProvider } = await import(
      "@/lib/auth/access-auth-provider.server"
    );

    expect(accessAuthProvider).toBe(supabaseAdapter);
    expect(createSupabaseAccessAuthProvider).toHaveBeenCalledTimes(1);
    expect(createLocalTestAccessAuthProvider).not.toHaveBeenCalled();
  });
});
