import { afterEach, describe, expect, test, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());
const verifyOtp = vi.hoisted(() => vi.fn());
const signUp = vi.hoisted(() => vi.fn());
const findAppUser = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    query: {
      user: {
        findFirst: findAppUser,
      },
    },
  },
}));

vi.mock("@/db/schema", () => ({
  accessCredential: {},
  accessSession: {},
  user: {
    email: "email",
  },
}));

vi.mock("@/lib/auth/access-test-auth.server", () => ({
  buildLocalAccessSessionHeaders: vi.fn(),
  createLocalAccessPasswordHash: vi.fn(),
  createLocalAccessUser: vi.fn(),
  readLocalAccessSession: vi.fn(),
  signInLocalAccessUser: vi.fn(),
  TEST_ACCESS_SESSION_COOKIE_NAME: "test-access-session",
}));

vi.mock("@/lib/auth/supabase-auth-ssr.server", () => ({
  createSupabaseServerClientForRequest: vi.fn(() => ({
    client: {
      auth: {
        getSession,
        getUser,
        signUp,
        verifyOtp,
      },
    },
    responseHeaders: new Headers(),
  })),
  getRequiredSupabaseEnv: vi.fn(),
}));

describe("accessAuthProvider", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  test("treats missing Supabase refresh tokens as an anonymous request", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITEST", "false");
    getUser.mockRejectedValue({
      __isAuthError: true,
      code: "refresh_token_not_found",
      status: 400,
    });

    const { accessAuthProvider } =
      await import("@/lib/auth/access-auth-provider.server");

    await expect(
      accessAuthProvider.getAccessSession(
        new Request("http://localhost/portal", {
          headers: {
            cookie: "sb-localhost-auth-token=stale",
          },
        }),
      ),
    ).resolves.toBeNull();
  });

  test("still propagates unexpected Supabase auth errors", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITEST", "false");
    getUser.mockRejectedValue({
      __isAuthError: true,
      code: "bad_jwt",
      status: 400,
    });

    const { accessAuthProvider } =
      await import("@/lib/auth/access-auth-provider.server");

    await expect(
      accessAuthProvider.getAccessSession(
        new Request("http://localhost/portal"),
      ),
    ).rejects.toMatchObject({
      code: "bad_jwt",
    });
  });

  test("verifies Supabase signup OTPs without creating the app-domain user yet", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITEST", "false");
    verifyOtp.mockResolvedValue({
      data: {
        user: {
          email: "academia@example.com",
          id: "supabase-user-id",
        },
      },
      error: null,
    });

    const { accessAuthProvider } =
      await import("@/lib/auth/access-auth-provider.server");

    await expect(
      accessAuthProvider.confirmEmailOtp({
        request: new Request("http://localhost/registro/confirmar"),
        tokenHash: "hash-confirmacion",
        type: "signup",
      }),
    ).resolves.toMatchObject({
      userId: "supabase-user-id",
    });

    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "hash-confirmacion",
      type: "signup",
    });
  });

  test("starts Supabase signup with the confirmation redirect", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VITEST", "false");
    signUp.mockResolvedValue({
      data: {
        user: {
          email: "academia@example.com",
          id: "supabase-user-id",
        },
      },
      error: null,
    });

    const { accessAuthProvider } =
      await import("@/lib/auth/access-auth-provider.server");

    await expect(
      accessAuthProvider.startEmailSignUp({
        email: "academia@example.com",
        password: "password-segura",
        redirectTo: "http://localhost/registro/confirmar",
        request: new Request("http://localhost/registro"),
      }),
    ).resolves.toEqual({
      headers: new Headers(),
    });

    expect(signUp).toHaveBeenCalledWith({
      email: "academia@example.com",
      password: "password-segura",
      options: {
        data: {
          name: "academia@example.com",
        },
        emailRedirectTo: "http://localhost/registro/confirmar",
      },
    });
    expect(findAppUser).not.toHaveBeenCalled();
  });
});
