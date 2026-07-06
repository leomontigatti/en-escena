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
  getPublicAccessResultToastId,
  isPublicAccessFormSubmitting,
  parsePublicAccessForm,
} from "@/lib/auth/public-access-route.shared";
import { loadPublicAccessRoute } from "@/lib/auth/public-access-route.server";

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

  test("parses public access forms while clearing non-preserved values", async () => {
    const requestRecoverySchema = z.object({
      email: z.string().trim().email(),
      password: z.string().min(8),
    });
    const formData = new FormData();
    formData.set("email", "  academia@example.com ");
    formData.set("password", "supersegura");

    const result = await parsePublicAccessForm({
      request: new Request("http://localhost/registro", {
        method: "POST",
        body: formData,
      }),
      schema: requestRecoverySchema,
      fieldNames: ["email", "password"] as const,
      preservedValueFields: ["email"] as const,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        email: "academia@example.com",
        password: "supersegura",
      },
      values: {
        email: "  academia@example.com ",
        password: "",
      },
    });
  });

  test("returns the shared invalid-form response when parsing fails", async () => {
    const requestRecoverySchema = z.object({
      email: z.string().trim().min(1, requiredFieldMessage),
      password: z.string().min(1, requiredFieldMessage),
    });
    const formData = new FormData();
    formData.set("email", "");
    formData.set("password", "");

    const result = await parsePublicAccessForm({
      request: new Request("http://localhost/ingresar", {
        method: "POST",
        body: formData,
      }),
      schema: requestRecoverySchema,
      fieldNames: ["email", "password"] as const,
      preservedValueFields: ["email"] as const,
    });

    expect(result).toEqual({
      ok: false,
      response: {
        status: "error",
        message: "Revisá los campos marcados.",
        fieldErrors: {
          email: requiredFieldMessage,
          password: requiredFieldMessage,
        },
        values: {
          email: "",
          password: "",
        },
      },
    });
  });

  test("maps public access result to the expected toast id", () => {
    expect(
      getPublicAccessResultToastId({
        status: "success",
        successToastId: "auth:ok",
        errorToastId: "auth:error",
      }),
    ).toBe("auth:ok");
    expect(
      getPublicAccessResultToastId({
        status: "error",
        successToastId: "auth:ok",
        errorToastId: "auth:error",
      }),
    ).toBe("auth:error");
  });

  test("detects when a public access form is submitting", () => {
    expect(
      isPublicAccessFormSubmitting({
        state: "submitting",
        formMethod: "POST",
      }),
    ).toBe(true);
    expect(
      isPublicAccessFormSubmitting({
        state: "idle",
        formMethod: "POST",
      }),
    ).toBe(false);
  });
});
