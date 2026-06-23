import { afterEach, describe, expect, test, vi } from "vitest";

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
      loader({
        request: new Request(
          "http://localhost/registro/confirmar?token_hash=hash-confirmacion&type=signup",
        ),
        params: {},
        context: {},
        url: new URL(
          "http://localhost/registro/confirmar?token_hash=hash-confirmacion&type=signup",
        ),
        pattern: "/registro/confirmar",
      }),
    );

    expect(confirmEmailOtp).toHaveBeenCalledWith({
      request: expect.any(Request),
      tokenHash: "hash-confirmacion",
      type: "signup",
    });
    expect(response.headers.get("location")).toBe("/registro/academia");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain("sb-access-token");
  });

  test("redirects invalid or expired confirmation links to the access error path", async () => {
    confirmEmailOtp.mockRejectedValue(new Error("otp_expired"));

    const response = await expectRedirect(
      loader({
        request: new Request(
          "http://localhost/registro/confirmar?token_hash=hash-vencido&type=signup",
        ),
        params: {},
        context: {},
        url: new URL(
          "http://localhost/registro/confirmar?token_hash=hash-vencido&type=signup",
        ),
        pattern: "/registro/confirmar",
      }),
    );

    expect(response.headers.get("location")).toBe(
      "/registro/error-confirmacion",
    );
  });

  test("redirects malformed confirmation links to the access error path", async () => {
    const response = await expectRedirect(
      loader({
        request: new Request("http://localhost/registro/confirmar?type=email"),
        params: {},
        context: {},
        url: new URL("http://localhost/registro/confirmar?type=email"),
        pattern: "/registro/confirmar",
      }),
    );

    expect(confirmEmailOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "/registro/error-confirmacion",
    );
  });
});

async function expectRedirect(resultPromise: Promise<unknown>) {
  try {
    await resultPromise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    return error as Response;
  }

  throw new Error("Expected a redirect response.");
}
