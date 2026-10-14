import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { academies, individuals, user } from "@/db/schema";
import { completeIndividualOnboarding } from "@/lib/individuals/onboarding.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

const getVerifiedAccessIdentity = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/access-auth-provider.server", () => ({
  accessAuthProvider: {
    getVerifiedAccessIdentity,
  },
}));

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
    vi.clearAllMocks();
  });

  test("turns the confirmed user into an individual with its owner row and its person, the document normalized", async () => {
    // Email confirmation creates the user with the default permission.
    await insertConfirmedUser("particular@example.com", "confirmed-user");
    getVerifiedAccessIdentity.mockResolvedValue(
      accessIdentity("particular@example.com", "confirmed-user"),
    );

    const result = await completeIndividualOnboarding({
      request: onboardingRequest(),
      values: personalData,
    });

    expect(result).toMatchObject({ ok: true });
    await expect(readUserRole("confirmed-user")).resolves.toBe("individual");
    await expect(readOwnerAndPerson("confirmed-user")).resolves.toEqual({
      owner: {
        city: null,
        contactName: "Ana María de la Cruz",
        kind: "individual",
        name: "Ana María de la Cruz",
        phone: "3511234567",
        province: null,
      },
      person: {
        documentNumber: "30123456",
        documentType: "dni",
        firstName: "Ana María",
        lastName: "de la Cruz",
      },
    });
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

    expect(result).toEqual({
      ok: false,
      error:
        "Este correo ya tiene una cuenta en En Escena, y cada correo es una sola cuenta. Para abrir una cuenta de Particular, registrate con otro correo.",
    });
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
      fieldErrors: { documentType: "Seleccioná el tipo de documento." },
    });
    await expect(
      completeIndividualOnboarding({
        request: onboardingRequest(),
        values: { ...personalData, documentNumber: "30a123" },
      }),
    ).resolves.toMatchObject({
      ok: false,
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

async function readOwnerAndPerson(userId: string) {
  const owner = await db.query.academies.findFirst({
    columns: {
      city: true,
      contactName: true,
      id: true,
      kind: true,
      name: true,
      phone: true,
      province: true,
    },
    where: eq(academies.userId, userId),
  });
  const person = owner
    ? await db.query.individuals.findFirst({
        columns: {
          documentNumber: true,
          documentType: true,
          firstName: true,
          lastName: true,
        },
        where: eq(individuals.academyId, owner.id),
      })
    : undefined;

  if (!owner) {
    return { owner, person };
  }

  const { id: _ownerId, ...ownerData } = owner;

  return { owner: ownerData, person };
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

function onboardingRequest() {
  return new Request("http://localhost/registro/particular", {
    method: "POST",
  });
}
