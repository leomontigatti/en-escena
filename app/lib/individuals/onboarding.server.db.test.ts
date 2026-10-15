import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import {
  createAccessRequestCookie,
  createAccessUser,
  markAccessUserEmailVerified,
} from "@/lib/auth/access-auth.test-support";
import { requireIndividualUser } from "@/lib/auth/internal-access.server";
import { completeIndividualOnboarding } from "@/lib/individuals/onboarding.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

const getVerifiedAccessIdentity = vi.hoisted(() => vi.fn());

// Real Better Auth, with a confirmed identity faked only where no real one
// can stand: an identity without an app user, or one whose email another
// user holds.
vi.mock("@/lib/auth/access-auth-provider.server", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/lib/auth/access-auth-provider.server")
    >();

  return {
    accessAuthProvider: {
      ...original.accessAuthProvider,
      getVerifiedAccessIdentity: (request: Request) =>
        getVerifiedAccessIdentity(request) ??
        original.accessAuthProvider.getVerifiedAccessIdentity(request),
    },
  };
});

const requirePendingOnboardingUser = vi.hoisted(() => vi.fn());

// The real guard, but for the race: there it answers what it read before the
// first submit committed.
vi.mock("@/lib/auth/pending-onboarding.server", async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import("@/lib/auth/pending-onboarding.server")
    >();

  return {
    requirePendingOnboardingUser: (request: Request) =>
      requirePendingOnboardingUser(request) ??
      original.requirePendingOnboardingUser(request),
  };
});

installDatabaseTestHooks();

const personalData = {
  documentNumber: "30.123 456",
  documentType: "dni",
  firstName: " ana  maría ",
  lastName: "de la cruz",
  phone: "3511234567",
};

describe("individual onboarding", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test("turns the confirmed user into an individual with its owner row and its person, the document normalized", async () => {
    const confirmed = await signUpConfirmedUser("particular@example.com");

    const result = await completeIndividualOnboarding({
      request: onboardingRequest(confirmed.cookie),
      values: personalData,
    });

    expect(result).toMatchObject({ ok: true });
    await expect(
      requireIndividualUser(onboardingRequest(confirmed.cookie)),
    ).resolves.toMatchObject({
      individual: {
        documentNumber: "30123456",
        documentType: "dni",
        firstName: "Ana María",
        lastName: "de la Cruz",
        phone: "3511234567",
      },
      user: { id: confirmed.userId, role: "individual" },
    });
    // No reader shows the owner row's names, kind or place.
    await expect(
      db.query.academies.findFirst({
        columns: {
          city: true,
          contactName: true,
          kind: true,
          name: true,
          province: true,
        },
        where: eq(academies.userId, confirmed.userId),
      }),
    ).resolves.toEqual({
      city: null,
      contactName: "Ana María de la Cruz",
      kind: "individual",
      name: "Ana María de la Cruz",
      province: null,
    });
  });

  test("a second submit racing the first lands in the account the first opened", async () => {
    const confirmed = await signUpConfirmedUser("particular@example.com");
    const request = onboardingRequest(confirmed.cookie);
    const { requirePendingOnboardingUser: realGuard } = await vi.importActual<
      typeof import("@/lib/auth/pending-onboarding.server")
    >("@/lib/auth/pending-onboarding.server");
    // Both submits pass the guard before either commits.
    const readBeforeCommit = await realGuard(request);
    requirePendingOnboardingUser.mockResolvedValue(readBeforeCommit);

    const first = await completeIndividualOnboarding({
      request,
      values: personalData,
    });
    const second = await completeIndividualOnboarding({
      request,
      values: personalData,
    });

    expect(first).toMatchObject({ ok: true });
    expect(second).toMatchObject({ ok: true });
    vi.resetAllMocks();
    await expect(
      requireIndividualUser(onboardingRequest(confirmed.cookie)),
    ).resolves.toMatchObject({ user: { role: "individual" } });
    // Only one person was opened; no reader counts them.
    await expect(db.query.individuals.findMany()).resolves.toHaveLength(1);
  });

  test("creates the user when the confirmed identity has none yet", async () => {
    getVerifiedAccessIdentity.mockResolvedValue(
      accessIdentity("nueva@example.com", "identity-without-user"),
    );

    const result = await completeIndividualOnboarding({
      request: onboardingRequest(),
      values: personalData,
    });

    expect(result).toMatchObject({ ok: true });
    await expect(
      db.query.user.findFirst({
        columns: { email: true, emailVerified: true, role: true },
        where: eq(user.id, "identity-without-user"),
      }),
    ).resolves.toEqual({
      email: "nueva@example.com",
      emailVerified: true,
      role: "individual",
    });
  });

  test("refuses an email that already has a user, says one email is one account and writes nothing", async () => {
    await insertConfirmedUser("ocupado@example.com", "existing-user");
    getVerifiedAccessIdentity.mockResolvedValue(
      accessIdentity("ocupado@example.com", "another-identity"),
    );

    const result = await completeIndividualOnboarding({
      request: onboardingRequest(),
      values: personalData,
    });

    expect(result).toEqual({ ok: false, reason: "email-taken" });
    await expect(
      db.query.user.findMany({ columns: { id: true } }),
    ).resolves.toEqual([{ id: "existing-user" }]);
    await expect(db.query.academies.findMany()).resolves.toEqual([]);
    await expect(db.query.individuals.findMany()).resolves.toEqual([]);
  });

  test("rolls the user and the owner row back when the person cannot be saved", async () => {
    await insertConfirmedUser("particular@example.com", "confirmed-user");
    getVerifiedAccessIdentity.mockResolvedValue(
      accessIdentity("particular@example.com", "confirmed-user"),
    );

    await expect(
      completeIndividualOnboarding({
        request: onboardingRequest(),
        // A document number past every check that Postgres refuses (a NUL
        // byte): only the person's insert, the last write, carries it.
        values: {
          ...personalData,
          documentNumber: "AB\u000012",
          documentType: "other",
        },
      }),
    ).rejects.toThrow();

    await expect(readUserRole("confirmed-user")).resolves.toBe("academy");
    await expect(db.query.academies.findMany()).resolves.toEqual([]);
    await expect(db.query.individuals.findMany()).resolves.toEqual([]);
  });

  test("refuses a document without its type or with letters in a DNI, and writes nothing", async () => {
    await insertConfirmedUser("particular@example.com", "confirmed-user");
    getVerifiedAccessIdentity.mockResolvedValue(
      accessIdentity("particular@example.com", "confirmed-user"),
    );

    await expect(
      completeIndividualOnboarding({
        request: onboardingRequest(),
        values: { ...personalData, documentType: "" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      reason: "invalid",
      fieldErrors: { documentType: "Seleccioná el tipo de documento." },
    });
    await expect(
      completeIndividualOnboarding({
        request: onboardingRequest(),
        values: { ...personalData, documentNumber: "30a123" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      reason: "invalid",
      fieldErrors: {
        documentNumber: "Ingresá un DNI válido usando solo números.",
      },
    });
    await expect(readUserRole("confirmed-user")).resolves.toBe("academy");
    await expect(db.query.individuals.findMany()).resolves.toEqual([]);
  });

  test("sends a user who already holds an account to its own area", async () => {
    await insertConfirmedUser("academia@example.com", "academy-user");
    await db.insert(academies).values({
      contactName: "Contacto",
      name: "Academia Existente",
      phone: "1112345678",
      userId: "academy-user",
    });
    getVerifiedAccessIdentity.mockResolvedValue(
      accessIdentity("academia@example.com", "academy-user"),
    );

    const thrown = await completeIndividualOnboarding({
      request: onboardingRequest(),
      values: personalData,
    }).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).headers.get("location")).toBe("/portal");
    await expect(readUserRole("academy-user")).resolves.toBe("academy");
    await expect(db.query.individuals.findMany()).resolves.toEqual([]);
  });
});

async function insertConfirmedUser(email: string, id: string) {
  await db.insert(user).values({
    email,
    emailVerified: true,
    id,
    name: email,
    role: "academy",
  });
}

async function readUserRole(userId: string) {
  const row = await db.query.user.findFirst({
    columns: { role: true },
    where: eq(user.id, userId),
  });

  return row?.role;
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

/** A real sign-up whose email is confirmed: the user holds no account yet. */
async function signUpConfirmedUser(email: string) {
  const signUp = await createAccessUser({
    email,
    name: email,
    password: "password-segura",
  });

  await markAccessUserEmailVerified(signUp.user.id);

  return {
    cookie: createAccessRequestCookie(signUp.headers),
    userId: signUp.user.id,
  };
}

function onboardingRequest(cookie?: string) {
  return new Request("http://localhost/registro/particular", {
    headers: cookie ? { cookie } : undefined,
    method: "POST",
  });
}
