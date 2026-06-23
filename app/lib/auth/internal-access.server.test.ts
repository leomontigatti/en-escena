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
  user: { id: "id" },
}));

vi.mock("@/lib/auth/access-auth-provider.server", () => ({
  accessAuthProvider: {
    getAccessSession,
    getVerifiedAccessIdentity,
    signOutCurrentSession: vi.fn(),
  },
}));

describe("internal access authorization", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("treats a confirmed academy identity without app user as pending onboarding", async () => {
    const pendingSession = createPendingOnboardingSession();

    getAccessSession.mockResolvedValue(pendingSession);
    getVerifiedAccessIdentity.mockResolvedValue({
      ...pendingSession,
      headers: new Headers(),
    });
    findUser.mockResolvedValue(null);

    const { requireSignedInUser } =
      await import("@/lib/auth/internal-access.server");

    const response = await expectThrownResponse(
      requireSignedInUser(new Request("http://localhost/portal")),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/registro/academia");
  });

  test("redirects pending academy onboarding sessions away from internal routes", async () => {
    const pendingSession = createPendingOnboardingSession();

    getAccessSession.mockResolvedValue(pendingSession);
    getVerifiedAccessIdentity.mockResolvedValue({
      ...pendingSession,
      headers: new Headers(),
    });
    findUser.mockResolvedValue(null);

    const { requireInternalUser } =
      await import("@/lib/auth/internal-access.server");

    const response = await expectThrownResponse(
      requireInternalUser(new Request("http://localhost/administracion")),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/registro/academia");
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
