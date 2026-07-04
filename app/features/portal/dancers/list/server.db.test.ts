import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographies, choreographyDancers, dancers } from "@/db/schema";
import { expectCreated } from "@/lib/events/bases-test-fixtures.server.db";
import { createModality } from "@/lib/modalities/repository.server";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import {
  handlePortalDancersListAction,
  loadPortalDancersList,
} from "@/features/portal/dancers/list/server";
import {
  createAcademyRecord,
  createAcademySession,
  createPortalPostRequest,
  expectThrownResponse,
} from "@/features/portal/test-support/db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("loadPortalDancersList", () => {
  test("creates normalized dancers and loads active plus archived rows for client filtering", async () => {
    const ownerSession = await createAcademySession({
      email: "bailarines.owner@example.com",
      academyName: "Academia Dueña",
    });
    const otherAcademy = await createAcademyRecord({
      email: "bailarines.other@example.com",
      academyName: "Academia Ajena",
    });
    await db.insert(dancers).values({
      academyId: ownerSession.academyId,
      firstName: "Beto",
      lastName: "Archivado",
      birthDate: "2013-02-02",
      active: false,
    });

    const createResponse = await expectThrownResponse(
      handlePortalDancersListAction(
        createPortalPostRequest(
          "http://localhost/portal/bailarines",
          ownerSession.cookie,
          dancerFormData({
            firstName: "  juan manuel ",
            lastName: " cruz de la torre ",
            birthDate: "2015-04-03",
          }),
        ),
      ),
      302,
    );
    expect(createResponse.headers.get("location")).toBe(
      "/portal/bailarines?notificacion=bailarin-creado",
    );
    await expectThrownResponse(
      handlePortalDancersListAction(
        createPortalPostRequest(
          "http://localhost/portal/bailarines",
          ownerSession.cookie,
          dancerFormData({
            firstName: "ana",
            lastName: "ALVAREZ",
            birthDate: "2014-02-01",
          }),
        ),
      ),
    );
    await db.insert(dancers).values({
      academyId: otherAcademy.id,
      firstName: "Otra",
      lastName: "Academia",
      birthDate: "2013-01-01",
    });

    const ownerLoaderData = await loadPortalDancersList(
      new Request("http://localhost/portal/bailarines", {
        headers: { cookie: ownerSession.cookie },
      }),
    );

    expect(ownerLoaderData.dancers).toMatchObject([
      {
        firstName: "Ana",
        lastName: "Alvarez",
        birthDate: "2014-02-01",
        active: true,
        documentNumber: null,
        verificationStatus: "incomplete",
      },
      {
        firstName: "Beto",
        lastName: "Archivado",
        birthDate: "2013-02-02",
        active: false,
        documentNumber: null,
        verificationStatus: "incomplete",
      },
      {
        firstName: "Juan Manuel",
        lastName: "Cruz de la Torre",
        birthDate: "2015-04-03",
        active: true,
        documentNumber: null,
        verificationStatus: "incomplete",
      },
    ]);
    expect(ownerLoaderData.dancers).toHaveLength(3);

    await expect(
      db.query.dancers.findFirst({
        where: and(
          eq(dancers.academyId, ownerSession.academyId),
          eq(dancers.firstName, "Juan Manuel"),
        ),
      }),
    ).resolves.toMatchObject({
      firstName: "Juan Manuel",
      lastName: "Cruz de la Torre",
      birthDate: "2015-04-03",
    });
  });

  test("rejects future dancer birth dates without creating a record", async () => {
    const session = await createAcademySession({
      email: "bailarines.future@example.com",
      academyName: "Academia Futuro",
    });

    const result = await handlePortalDancersListAction(
      createPortalPostRequest(
        "http://localhost/portal/bailarines",
        session.cookie,
        dancerFormData({
          firstName: "Martina",
          lastName: "López",
          birthDate: "2999-01-01",
        }),
      ),
    );

    expect(result).toMatchObject({
      status: "error",
      fieldErrors: {
        birthDate: "La fecha de nacimiento no puede ser futura.",
      },
      values: {
        firstName: "Martina",
        lastName: "López",
        birthDate: "2999-01-01",
      },
    });
    await expect(db.query.dancers.findMany()).resolves.toEqual([]);
  });

  test("marks dancers linked to active event choreographies as participating", async () => {
    const event = await createSavedEvent({ name: "En Escena 2026" });
    await activateEvent(event.id);
    const session = await createAcademySession({
      email: "bailarines.participacion@example.com",
      academyName: "Academia Participacion",
    });
    const modality = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );
    const [dancer] = await db
      .insert(dancers)
      .values({
        academyId: session.academyId,
        firstName: "Ana",
        lastName: "Participa",
        birthDate: "2014-02-01",
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
    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      ageAtEventStart: 12,
    });

    const loaderData = await loadPortalDancersList(
      new Request("http://localhost/portal/bailarines", {
        headers: { cookie: session.cookie },
      }),
    );

    expect(loaderData.dancers).toMatchObject([
      {
        firstName: "Ana",
        lastName: "Participa",
        participationStatus: "participating",
      },
    ]);
  });
});

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

function dancerFormData(input: {
  firstName: string;
  lastName: string;
  birthDate: string;
}) {
  const formData = new FormData();
  formData.set("intent", "create-dancer");
  formData.set("firstName", input.firstName);
  formData.set("lastName", input.lastName);
  formData.set("birthDate", input.birthDate);

  return formData;
}

function date(value: string) {
  return new Date(value);
}
