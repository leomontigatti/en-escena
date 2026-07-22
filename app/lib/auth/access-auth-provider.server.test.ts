import { afterEach, describe, expect, test, vi } from "vitest";

const createBetterAuthAccessAuthProvider = vi.hoisted(() => vi.fn());

const betterAuthAdapter = {
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

vi.mock("@/lib/auth/access-auth-provider.betterauth.server", () => ({
  createBetterAuthAccessAuthProvider,
}));

describe("accessAuthProvider", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    createBetterAuthAccessAuthProvider.mockReset();
  });

  // Forward-only, sin flag (#266/#422): el selector resuelve a Better Auth
  // siempre, sin ramificar por modo de test. Las ramas Supabase de los internos
  // se retiran en #423.
  test("uses the Better Auth adapter once, without branching on test mode", async () => {
    createBetterAuthAccessAuthProvider.mockReturnValue(betterAuthAdapter);

    const { accessAuthProvider } =
      await import("@/lib/auth/access-auth-provider.server");

    expect(accessAuthProvider).toBe(betterAuthAdapter);
    expect(createBetterAuthAccessAuthProvider).toHaveBeenCalledTimes(1);
  });
});
