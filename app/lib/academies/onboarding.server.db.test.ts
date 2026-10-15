import { eq } from "drizzle-orm";
import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import {
  completeAcademyOnboarding,
  requireAcademyOnboardingUser,
} from "@/lib/academies/onboarding.server";
import { completeIndividualOnboarding } from "@/lib/individuals/onboarding.server";
import {
  action as academyOnboardingAction,
  loader as academyOnboardingLoader,
} from "@/routes/registro_.academia";

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

  test("allows a confirmed access session without an academy to load onboarding", async () => {
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

  test("creates the user and academy for a confirmed session and redirects with SSR headers", async () => {
    getVerifiedAccessIdentity.mockResolvedValue({
      headers: new Headers({
        "cache-control": "no-store",
        "set-cookie": "better-auth.session_token=confirmado; Path=/; HttpOnly",
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
            city: " rosario ",
            contactName: " contacto principal ",
            phone: "1112345678",
            province: "santa_fe",
          }),
        ),
      ),
    );

    expect(response.headers.get("location")).toBe("/portal");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain(
      "better-auth.session_token",
    );
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
          city: true,
          contactName: true,
          name: true,
          phone: true,
          province: true,
          userId: true,
        },
        where: eq(academies.userId, "supabase-confirmed-user"),
      }),
    ).resolves.toEqual({
      city: "Rosario",
      contactName: "Contacto Principal",
      name: "Academia Confirmada",
      phone: "1112345678",
      province: "santa_fe",
      userId: "supabase-confirmed-user",
    });
  });

  test("creates an academy from abroad with `Otro país`", async () => {
    getVerifiedAccessIdentity.mockResolvedValue(
      accessIdentity("extranjera@example.com", "user-extranjera"),
    );

    await expectRedirectResponse(
      academyOnboardingAction(
        routeActionArgs(
          createOnboardingRequest({
            academyName: "Academia Extranjera",
            contactName: "Contacto",
            phone: "1112345678",
            province: "otro_pais",
          }),
        ),
      ),
    );

    await expect(
      db.query.academies.findFirst({
        columns: { province: true },
        where: eq(academies.userId, "user-extranjera"),
      }),
    ).resolves.toEqual({ province: "otro_pais" });
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
        "set-cookie": "better-auth.session_token=confirmado; Path=/; HttpOnly",
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
        city: undefined,
        province: undefined,
      },
      message:
        "No pudimos completar el alta de la academia porque este acceso ya está asociado a otro usuario. Volvé a ingresar o contactanos.",
      status: "error",
      values: {
        academyName: "Academia Conflicto",
        contactName: "Contacto Conflicto",
        phone: "1112345678",
        city: "Ciudad",
        province: "santa_fe",
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

  // Two tabs, or a click before hydration, can post twice at once: both pass
  // the guard before either commits, and the second insert collides with the
  // first. The academy is theirs either way, so both land in the portal.
  test("sends a submit that loses the race to its own first submit to the portal", async () => {
    getVerifiedAccessIdentity.mockResolvedValue(
      accessIdentity("doble@example.com", "user-doble"),
    );
    const readBeforeCommit = await requireAcademyOnboardingUser(
      new Request("http://localhost/registro/academia"),
    );

    const first = await completeAcademyOnboarding(
      academyInput(readBeforeCommit),
    );
    const second = await completeAcademyOnboarding(
      academyInput(readBeforeCommit),
    );

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    await expect(
      db.query.academies.findMany({ columns: { userId: true } }),
    ).resolves.toEqual([{ userId: "user-doble" }]);
  });

  // The same race against the `Particular` form in another tab: the owner row
  // that wins is an individual's, so the academy was not created.
  test("refuses an academy submit that loses the race to the same user's `Particular` account", async () => {
    getVerifiedAccessIdentity.mockResolvedValue(
      accessIdentity("ambas@example.com", "user-ambas"),
    );
    const readBeforeCommit = await requireAcademyOnboardingUser(
      new Request("http://localhost/registro/academia"),
    );

    await expect(
      completeIndividualOnboarding({
        request: new Request("http://localhost/registro/particular"),
        values: {
          documentNumber: "30123456",
          documentType: "dni",
          firstName: "Ana",
          lastName: "Cruz",
          phone: "3511234567",
        },
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      completeAcademyOnboarding(academyInput(readBeforeCommit)),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      db.query.academies.findMany({ columns: { kind: true } }),
    ).resolves.toEqual([{ kind: "individual" }]);
  });

  test("warns when another academy already uses the typed name and creates nothing", async () => {
    await seedExistingAcademy();

    getVerifiedAccessIdentity.mockResolvedValue(
      accessIdentity("duplicada@example.com", "supabase-duplicate-user"),
    );

    const answer = await academyOnboardingAction(
      routeActionArgs(
        createOnboardingRequest({
          academyName: "  academia   existente  ",
          contactName: "Contacto Duplicado",
          phone: "1112345678",
        }),
      ),
    );

    // No `message`: the inline notice carries the copy, so the warning answer
    // never reaches the route's toast.
    expect(answer).not.toHaveProperty("message");
    expect(answer).toEqual({
      status: "warning",
      values: {
        academyName: "  academia   existente  ",
        contactName: "Contacto Duplicado",
        phone: "1112345678",
        city: "Ciudad",
        province: "santa_fe",
      },
      warning: {
        kind: "academy-name",
        matches: [
          {
            createdAt: new Date("2026-09-21T12:00:00.000Z"),
            id: "academia-existente",
            name: "Academia Existente",
          },
        ],
      },
    });
    await expect(
      db.query.academies.findMany({ columns: { id: true } }),
    ).resolves.toEqual([{ id: "academia-existente" }]);
    await expect(
      db.query.user.findMany({
        columns: { id: true },
        orderBy: (fields, { asc }) => [asc(fields.id)],
      }),
    ).resolves.toEqual([{ id: "duena-existente" }]);
  });

  test("creates the academy once the existing name is acknowledged", async () => {
    await seedExistingAcademy();

    getVerifiedAccessIdentity.mockResolvedValue(
      accessIdentity("duplicada@example.com", "supabase-duplicate-user"),
    );

    const response = await expectRedirectResponse(
      academyOnboardingAction(
        routeActionArgs(
          createOnboardingRequest({
            academyName: "Academia Existente",
            acknowledgedDuplicateIds: ["academia-existente"],
            contactName: "Contacto Duplicado",
            phone: "1112345678",
          }),
        ),
      ),
    );

    expect(response.headers.get("location")).toBe("/portal");
    await expect(
      db.query.academies.findFirst({
        columns: { name: true },
        where: eq(academies.userId, "supabase-duplicate-user"),
      }),
    ).resolves.toEqual({ name: "Academia Existente" });
  });

  test("warns again for a match the person has not seen yet", async () => {
    await seedExistingAcademy();
    await db.insert(user).values({
      id: "duena-reciente",
      name: "Duena Reciente",
      email: "reciente@example.com",
      emailVerified: true,
      role: "academy",
    });
    await db.insert(academies).values({
      id: "academia-reciente",
      userId: "duena-reciente",
      name: "Academia   Existente",
      contactName: "Contacto Reciente",
      phone: "1112345678",
      createdAt: new Date("2026-09-23T12:00:00.000Z"),
    });

    getVerifiedAccessIdentity.mockResolvedValue(
      accessIdentity("duplicada@example.com", "supabase-duplicate-user"),
    );

    await expect(
      academyOnboardingAction(
        routeActionArgs(
          createOnboardingRequest({
            academyName: "Academia Existente",
            acknowledgedDuplicateIds: ["academia-existente"],
            contactName: "Contacto Duplicado",
            phone: "1112345678",
          }),
        ),
      ),
    ).resolves.toMatchObject({
      status: "warning",
      // Both matches, the acknowledged one included, so the next submit covers
      // the whole set instead of alternating between the two.
      warning: {
        kind: "academy-name",
        matches: [
          {
            id: "academia-existente",
            name: "Academia Existente",
          },
          {
            createdAt: new Date("2026-09-23T12:00:00.000Z"),
            id: "academia-reciente",
            name: "Academia   Existente",
          },
        ],
      },
    });
    await expect(
      db.query.academies.findFirst({
        columns: { id: true },
        where: eq(academies.userId, "supabase-duplicate-user"),
      }),
    ).resolves.toBeUndefined();
  });
});

function academyInput(
  onboardingUser: Awaited<ReturnType<typeof requireAcademyOnboardingUser>>,
) {
  return {
    academyName: "Academia Carrera",
    acknowledgedDuplicateIds: [],
    city: "Ciudad",
    contactName: "Contacto",
    onboardingUser,
    phone: "1112345678",
    province: "santa_fe" as const,
  };
}

function accessIdentity(email: string, id: string) {
  return {
    headers: new Headers({
      "set-cookie": "better-auth.session_token=confirmado; Path=/; HttpOnly",
    }),
    session: {
      id: "session-token",
      issuedAt: new Date("2026-06-23T00:00:00.000Z"),
    },
    user: { email, id },
  };
}

async function seedExistingAcademy() {
  await db.insert(user).values({
    id: "duena-existente",
    name: "Duena",
    email: "duena@example.com",
    emailVerified: true,
    role: "academy",
  });
  await db.insert(academies).values({
    id: "academia-existente",
    userId: "duena-existente",
    name: "Academia Existente",
    contactName: "Contacto Existente",
    phone: "1112345678",
    createdAt: new Date("2026-09-21T12:00:00.000Z"),
  });
}

function createOnboardingRequest(input: {
  academyName: string;
  acknowledgedDuplicateIds?: string[];
  city?: string;
  contactName: string;
  phone: string;
  province?: string;
}) {
  const body = new URLSearchParams({
    academyName: input.academyName,
    city: input.city ?? "Ciudad",
    contactName: input.contactName,
    phone: input.phone,
    province: input.province ?? "santa_fe",
  });

  for (const id of input.acknowledgedDuplicateIds ?? []) {
    body.append("acknowledgedDuplicateIds", id);
  }

  return new Request("http://localhost/registro/academia", {
    body,
    method: "POST",
  });
}

function routeLoaderArgs(request: Request) {
  const url = new URL(request.url);

  return {
    context: new RouterContextProvider(),
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
