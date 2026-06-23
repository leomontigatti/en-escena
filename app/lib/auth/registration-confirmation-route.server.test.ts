import { afterEach, describe, expect, test, vi } from "vitest";

import {
  PUBLIC_ACADEMY_ONBOARDING_PATH,
  PUBLIC_REGISTRATION_CONFIRMATION_ERROR_PATH,
  PUBLIC_REGISTRATION_CONFIRMATION_PATH,
} from "@/lib/auth/access-paths.shared";

const confirmEmailOtp = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/access-auth-provider.server", () => ({
  accessAuthProvider: {
    confirmEmailOtp,
  },
}));

import { loader } from "@/routes/registro.confirmar";

describe("registro confirm loader", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("verifies the Supabase confirmation link and redirects to academy onboarding", async () => {
    confirmEmailOtp.mockResolvedValue({
      headers: new Headers({
        "cache-control": "no-store",
        "set-cookie": "sb-access-token=confirmado; Path=/; HttpOnly",
      }),
      userId: "academy-user",
    });

    const response = await expectRedirect(
      loadRegistrationConfirmationRoute(
        "token_hash=hash-confirmacion&type=signup",
      ),
    );

    expect(confirmEmailOtp).toHaveBeenCalledWith({
      request: expect.any(Request),
      tokenHash: "hash-confirmacion",
      type: "signup",
    });
    expect(response.headers.get("location")).toBe(
      PUBLIC_ACADEMY_ONBOARDING_PATH,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain("sb-access-token");
  });

  test("redirects invalid or expired confirmation links to the access error path", async () => {
    confirmEmailOtp.mockRejectedValue(new Error("otp_expired"));

    const response = await expectRedirect(
      loadRegistrationConfirmationRoute("token_hash=hash-vencido&type=signup"),
    );

    expect(response.headers.get("location")).toBe(
      PUBLIC_REGISTRATION_CONFIRMATION_ERROR_PATH,
    );
  });

  test("redirects malformed confirmation links to the access error path", async () => {
    const response = await expectRedirect(
      loadRegistrationConfirmationRoute("type=email"),
    );

    expect(confirmEmailOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      PUBLIC_REGISTRATION_CONFIRMATION_ERROR_PATH,
    );
  });
});

function loadRegistrationConfirmationRoute(search: string) {
  const url = new URL(
    `http://localhost${PUBLIC_REGISTRATION_CONFIRMATION_PATH}?${search}`,
  );

  return loader({
    request: new Request(url),
    params: {},
    context: {},
    url,
    pattern: PUBLIC_REGISTRATION_CONFIRMATION_PATH,
  });
}

async function expectRedirect(resultPromise: Promise<unknown>) {
  try {
    await resultPromise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    return error as Response;
  }

  throw new Error("Expected a redirect response.");
}
