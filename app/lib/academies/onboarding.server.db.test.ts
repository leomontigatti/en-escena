import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import {
  action as academyOnboardingAction,
  loader as academyOnboardingLoader,
} from "@/routes/registro.academia";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

const getVerifiedAccessIdentity = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/access-auth-provider.server", () => ({
  accessAuthProvider: {
    getVerifiedAccessIdentity,
  },
}));

installDatabaseTestHooks();

describe("academy onboarding route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("allows a confirmed access session without an Academia to load onboarding", async () => {
    getVerifiedAccessIdentity.mockResolvedValue({
      headers: new Headers(),
      session: {
        id: "session-token",
        issuedAt: new Date("2026-06-23T00:00:00.000Z"),
      },
      user: {
        email: "confirmada@example.com",
        id: "supabase-confirmed-user",
      },
    });

    await expect(
      academyOnboardingLoader(
        routeLoaderArgs(new Request("http://localhost/registro/academia")),
      ),
    ).resolves.toBeNull();
  });

  test("creates the Usuario and Academia for a confirmed session and redirects with SSR headers", async () => {
    getVerifiedAccessIdentity.mockResolvedValue({
      headers: new Headers({
        "cache-control": "no-store",
        "set-cookie": "sb-access-token=confirmado; Path=/; HttpOnly",
      }),
      session: {
        id: "session-token",
        issuedAt: new Date("2026-06-23T00:00:00.000Z"),
      },
      user: {
        email: "confirmada@example.com",
        id: "supabase-confirmed-user",
      },
    });

    const response = await expectRedirectResponse(
      academyOnboardingAction(
        routeActionArgs(
          createOnboardingRequest({
            academyName: " academia confirmada ",
            contactName: " contacto principal ",
            phone: "1112345678",
          }),
        ),
      ),
    );

    expect(response.headers.get("location")).toBe("/portal");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain("sb-access-token");
    await expect(
      db.query.user.findFirst({
        columns: {
          email: true,
          emailVerified: true,
          id: true,
          role: true,
        },
        where: eq(user.id, "supabase-confirmed-user"),
      }),
    ).resolves.toEqual({
      email: "confirmada@example.com",
      emailVerified: true,
      id: "supabase-confirmed-user",
      role: "academy",
    });
    await expect(
      db.query.academies.findFirst({
        columns: {
          contactName: true,
          name: true,
          phone: true,
          userId: true,
        },
        where: eq(academies.userId, "supabase-confirmed-user"),
      }),
    ).resolves.toEqual({
      contactName: "Contacto Principal",
      name: "Academia Confirmada",
      phone: "1112345678",
      userId: "supabase-confirmed-user",
    });
  });

  test("reports conflicting onboarding and rolls back partial domain writes", async () => {
    await db.insert(user).values({
      id: "existing-domain-user",
      name: "Existente",
      email: "conflicto@example.com",
      emailVerified: true,
      role: "academy",
    });

    getVerifiedAccessIdentity.mockResolvedValue({
      headers: new Headers({
        "set-cookie": "sb-access-token=confirmado; Path=/; HttpOnly",
      }),
      session: {
        id: "session-token",
        issuedAt: new Date("2026-06-23T00:00:00.000Z"),
      },
      user: {
        email: "conflicto@example.com",
        id: "supabase-conflict-user",
      },
    });

    await expect(
      academyOnboardingAction(
        routeActionArgs(
          createOnboardingRequest({
            academyName: "Academia Conflicto",
            contactName: "Contacto Conflicto",
            phone: "1112345678",
          }),
        ),
      ),
    ).resolves.toEqual({
      fieldErrors: {
        academyName: undefined,
        contactName: undefined,
        phone: undefined,
      },
      message:
        "No pudimos completar el alta de la academia porque este acceso ya está asociado a otro usuario. Volvé a ingresar o contactanos.",
      status: "error",
      values: {
        academyName: "Academia Conflicto",
        contactName: "Contacto Conflicto",
        phone: "1112345678",
      },
    });
    await expect(
      db.query.user.findMany({
        columns: { id: true },
        orderBy: (fields, { asc }) => [asc(fields.id)],
      }),
    ).resolves.toEqual([{ id: "existing-domain-user" }]);
    await expect(db.query.academies.findMany()).resolves.toEqual([]);
  });

  test("validates academy onboarding phone input without creating domain records", async () => {
    getVerifiedAccessIdentity.mockResolvedValue({
      headers: new Headers({
        "set-cookie": "sb-access-token=confirmado; Path=/; HttpOnly",
      }),
      session: {
        id: "session-token",
        issuedAt: new Date("2026-06-23T00:00:00.000Z"),
      },
      user: {
        email: "telefono@example.com",
        id: "supabase-phone-user",
      },
    });

    await expect(
      academyOnboardingAction(
        routeActionArgs(
          createOnboardingRequest({
            academyName: "Academia Telefono",
            contactName: "Contacto Telefono",
            phone: "11 1234-5678",
          }),
        ),
      ),
    ).resolves.toEqual({
      fieldErrors: {
        academyName: undefined,
        contactName: undefined,
        phone: "Ingresá 10 dígitos, sin espacios, 0 ni 15.",
      },
      message: "Revisá los campos marcados.",
      status: "error",
      values: {
        academyName: "Academia Telefono",
        contactName: "Contacto Telefono",
        phone: "11 1234-5678",
      },
    });
    await expect(db.query.user.findMany()).resolves.toEqual([]);
    await expect(db.query.academies.findMany()).resolves.toEqual([]);
  });
});

function createOnboardingRequest(input: {
  academyName: string;
  contactName: string;
  phone: string;
}) {
  return new Request("http://localhost/registro/academia", {
    body: new URLSearchParams(input),
    method: "POST",
  });
}

function routeLoaderArgs(request: Request) {
  const url = new URL(request.url);

  return {
    context: {},
    params: {},
    pattern: "/registro/academia",
    request,
    url,
  };
}

function routeActionArgs(request: Request) {
  return routeLoaderArgs(request);
}

async function expectRedirectResponse(resultPromise: Promise<unknown>) {
  try {
    await resultPromise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    return error as Response;
  }

  throw new Error("Expected a redirect response.");
}
