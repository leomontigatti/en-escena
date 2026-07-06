import { afterEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

import { requiredFieldMessage } from "@/lib/shared/forms";

const redirectSignedInUserFromPublicRoute = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/internal-navigation.server", () => ({
  redirectSignedInUserFromPublicRoute,
}));

import {
  buildPublicAccessFormError,
  buildPublicAccessFormSuccess,
  loadPublicAccessRoute,
} from "@/lib/auth/public-access-route.shared";

describe("public access route shared helpers", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test("keeps public routes available while passing through SSR headers", async () => {
    redirectSignedInUserFromPublicRoute.mockResolvedValue({
      headers: new Headers({
        "set-cookie": "sb-project-auth-token=; Max-Age=0; Path=/",
      }),
    });

    const result = await loadPublicAccessRoute(
      new Request("http://localhost/registro"),
    );

    expect(result.data).toBe(null);
    expect(result.init?.headers).toEqual(
      new Headers({
        "set-cookie": "sb-project-auth-token=; Max-Age=0; Path=/",
      }),
    );
  });

  test("builds the shared invalid-form response shape", () => {
    const schema = z.object({
      email: z.string().trim().min(1, requiredFieldMessage),
    });
    const parsed = schema.safeParse({ email: "" });

    expect(parsed.success).toBe(false);
    expect(
      buildPublicAccessFormError({
        error: parsed.error!,
        fieldNames: ["email"] as const,
        values: { email: "" },
      }),
    ).toEqual({
      status: "error",
      message: "Revisá los campos marcados.",
      fieldErrors: {
        email: requiredFieldMessage,
      },
      values: {
        email: "",
      },
    });
  });

  test("builds the shared success response shape with empty field errors", () => {
    const headers = new Headers({
      "set-cookie": "sb-registration=start; Path=/; HttpOnly",
    });

    const result = buildPublicAccessFormSuccess({
      message: "Mensaje generico",
      values: { email: "academia@example.com" },
      headers,
    });

    expect(result.data).toEqual({
      status: "success",
      message: "Mensaje generico",
      fieldErrors: {},
      values: {
        email: "academia@example.com",
      },
    });
    expect(result.init?.headers).toBe(headers);
  });
});
