import { afterEach, describe, expect, test, vi } from "vitest";

const getAccessSession = vi.hoisted(() => vi.fn());
const getVerifiedAccessIdentity = vi.hoisted(() => vi.fn());
const findUser = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    query: {
      academies: {
        findFirst: vi.fn(),
      },
      user: {
        findFirst: findUser,
      },
    },
  },
}));

vi.mock("@/db/schema", () => ({
  academies: { userId: "userId" },
  accessSession: { userId: "userId" },
  user: { email: "email", id: "id" },
}));

vi.mock("@/lib/auth/access-auth-provider.server", () => ({
  accessAuthProvider: {
    getAccessSession,
    getVerifiedAccessIdentity,
    signOutCurrentSession: vi.fn(),
  },
}));

describe("internal navigation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("redirects signed-in pending onboarding sessions away from public routes", async () => {
    const pendingSession = createPendingOnboardingSession();

    getAccessSession.mockResolvedValue(pendingSession);
    getVerifiedAccessIdentity.mockResolvedValue({
      ...pendingSession,
      headers: new Headers(),
    });
    findUser.mockResolvedValue(null);

    const { redirectSignedInUserFromPublicRoute } =
      await import("@/lib/auth/internal-navigation.server");

    const response = await expectThrownResponse(
      redirectSignedInUserFromPublicRoute(
        new Request("http://localhost/ingresar"),
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/registro/academia");
  });

  test("keeps public routes available while clearing stale Supabase cookies", async () => {
    getAccessSession.mockResolvedValue(null);

    const { redirectSignedInUserFromPublicRoute } =
      await import("@/lib/auth/internal-navigation.server");

    const result = await redirectSignedInUserFromPublicRoute(
      new Request("http://localhost/registro", {
        headers: {
          cookie: "theme=escena; sb-project-auth-token=stale",
        },
      }),
    );

    expect(getSetCookieValues(new Headers(result?.headers))).toEqual([
      "sb-project-auth-token=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
    ]);
  });
});

function createPendingOnboardingSession() {
  return {
    session: {
      id: "session-id",
      issuedAt: new Date("2026-06-23T00:00:00.000Z"),
    },
    user: {
      email: "pendiente@example.com",
      id: "supabase-user-id",
    },
  };
}

async function expectThrownResponse(resultPromise: Promise<unknown>) {
  try {
    await resultPromise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    return error as Response;
  }

  throw new Error("Expected a redirect response.");
}

function getSetCookieValues(headers: Headers) {
  if ("getSetCookie" in headers && typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }

  const setCookie = headers.get("set-cookie");

  return setCookie ? [setCookie] : [];
}
