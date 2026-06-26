import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academies,
  choreographies,
  choreographyProfessors,
  professors,
  user,
} from "@/db/schema";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";
import { createModality } from "@/lib/events/bases-repository.server";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import {
  handlePortalProfessorsListAction,
  loadPortalProfessorsList,
} from "@/features/portal/professors/list/server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("loadPortalProfessorsList", () => {
  test("creates normalized professors and loads active plus archived rows for client filtering", async () => {
    const owner = await createAcademySession({
      email: "profesores.owner@example.com",
      academyName: "Academia Dueña",
    });
    const other = await createAcademySession({
      email: "profesores.other@example.com",
      academyName: "Academia Ajena",
    });

    await db.insert(professors).values({
      academyId: owner.academyId,
      firstName: "Ana",
      lastName: "Zapata",
    });
    await db.insert(professors).values({
      academyId: owner.academyId,
      firstName: "Bea",
      lastName: "Archivada",
      active: false,
    });
    await db.insert(professors).values({
      academyId: other.academyId,
      firstName: "Ajeno",
      lastName: "Alvarez",
    });

    const createResponse = await expectThrownResponse(
      handlePortalProfessorsListAction(
        new Request("http://localhost/portal/profesores", {
          method: "POST",
          headers: { cookie: owner.cookie },
          body: formData({
            intent: "create-professor",
            firstName: "  jOSÉ  luis ",
            lastName: " de la CRUZ ",
          }),
        }),
      ),
      302,
    );

    expect(createResponse.headers.get("location")).toBe(
      "/portal/profesores?notificacion=profesor-creado",
    );

    const loaderData = await loadPortalProfessorsList(
      new Request("http://localhost/portal/profesores", {
        headers: { cookie: owner.cookie },
      }),
    );

    expect(loaderData.professors).toEqual([
      expect.objectContaining({
        firstName: "Ana",
        lastName: "Zapata",
        active: true,
        documentType: null,
        documentNumber: null,
        isIncomplete: true,
      }),
      expect.objectContaining({
        firstName: "Bea",
        lastName: "Archivada",
        active: false,
        documentType: null,
        documentNumber: null,
        isIncomplete: true,
      }),
      expect.objectContaining({
        firstName: "José Luis",
        lastName: "de la Cruz",
        active: true,
        documentType: null,
        documentNumber: null,
        isIncomplete: true,
      }),
    ]);
  });

  test("marks professors linked to active event choreographies as participating", async () => {
    const event = await createSavedEvent({ name: "En Escena 2026" });
    await activateEvent(event.id);
    const session = await createAcademySession({
      email: "profesores.participacion@example.com",
      academyName: "Academia Participacion Profesores",
    });
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const [professor] = await db
      .insert(professors)
      .values({
        academyId: session.academyId,
        firstName: "Paula",
        lastName: "Participa",
      })
      .returning();
    const [choreography] = await db
      .insert(choreographies)
      .values({
        academyId: session.academyId,
        eventId: event.id,
        name: "Solo activo",
        groupType: "solo",
        modalityId: modality.id,
        categoryCalculationMode: "oldest",
      })
      .returning();
    await db.insert(choreographyProfessors).values({
      choreographyId: choreography.id,
      professorId: professor.id,
    });

    const loaderData = await loadPortalProfessorsList(
      new Request("http://localhost/portal/profesores", {
        headers: { cookie: session.cookie },
      }),
    );

    expect(loaderData.professors).toMatchObject([
      {
        firstName: "Paula",
        lastName: "Participa",
        participationStatus: "participating",
      },
    ]);
  });
});

async function createAcademySession({
  academyName,
  email,
}: {
  academyName: string;
  email: string;
}) {
  const signUpResult = await createLocalAccessUser({
    email,
    name: email,
    password: "password-segura",
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role: "academy",
    })
    .where(eq(user.id, signUpResult.response.user.id));

  const [academy] = await db
    .insert(academies)
    .values({
      userId: signUpResult.response.user.id,
      name: academyName,
      contactName: "Contacto",
      phone: "1112345678",
    })
    .returning();

  return {
    academyId: academy.id,
    cookie: createRequestCookie(signUpResult.headers),
  };
}

async function createSavedEvent(
  overrides: Partial<Parameters<typeof createEvent>[0]> = {},
) {
  const result = await createEvent({
    name: "Evento",
    registrationStartsAt: date("2026-03-01T12:00:00Z"),
    registrationEndsAt: date("2026-04-30T12:00:00Z"),
    startsAt: date("2026-05-01T12:00:00Z"),
    endsAt: date("2026-05-03T12:00:00Z"),
    ...overrides,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.event;
}

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  const sessionCookie = setCookie.match(/sb-access-token=([^;]+)/);

  if (!sessionCookie?.[1]) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  return `sb-access-token=${sessionCookie[1]}`;
}

function date(value: string) {
  return new Date(value);
}

function formData(values: Record<string, string>) {
  const data = new FormData();

  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }

  return data;
}

async function expectCreated(
  resultPromise: Promise<{
    ok: boolean;
    record?: { id: string };
  }>,
) {
  const result = await resultPromise;

  if (!result.ok || !result.record) {
    throw new Error("Expected Bases del evento creation to succeed.");
  }

  return result.record;
}

async function expectThrownResponse(
  promise: Promise<unknown>,
  expectedStatus?: number,
) {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Response) {
      if (expectedStatus !== undefined) {
        expect(error.status).toBe(expectedStatus);
      }

      return error;
    }

    throw error;
  }

  throw new Error("Expected a Response to be thrown.");
}
