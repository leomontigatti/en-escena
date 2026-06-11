import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academies,
  categories,
  categoryExperienceLevels,
  categoryModalities,
  dancers,
  events,
  experienceLevels,
  modalities,
  prices,
  scheduleBlockModalities,
  scheduleBlocks,
  scheduleEntries,
  submodalities,
  user,
} from "@/db/schema";
import { auth } from "@/lib/auth.server";
import { resolveChoreographyRegistrationOperation } from "@/lib/portal-choreography-registration.server";

import { installDatabaseTestHooks } from "../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("portal choreography registration operation", () => {
  test("resolves a valid solo registration using the Evento local start date, required experience levels, and compatible Cronogramas", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Dueña",
      email: "registro.coreografia.owner@example.com",
    });
    const event = await createEventRecord({
      active: true,
      registrationStartsAt: date("2026-03-01T12:00:00Z"),
      registrationEndsAt: date("2099-04-30T12:00:00Z"),
      startsAt: date("2026-05-01T02:30:00Z"),
    });
    const catalog = await createEventCatalog(event.id);
    const dancer = await createDancer(owner.academyId, {
      birthDate: "2013-05-01",
      firstName: "Ana",
      lastName: "Paz",
    });

    await expect(
      resolveChoreographyRegistrationOperation({
        academyId: owner.academyId,
        eventId: event.id,
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [dancer.id],
      }),
    ).resolves.toMatchObject({
      ok: true,
      resolution: {
        groupType: "solo",
        category: {
          status: "resolved",
          id: catalog.childCategory.id,
          name: catalog.childCategory.name,
        },
        categoryCalculationMode: "oldest",
        categoryAgeBasis: 12,
        experienceLevel: {
          required: true,
          options: [{ id: catalog.level.id, name: catalog.level.name }],
        },
        schedule: {
          status: "auto",
          canConfirm: true,
          options: [{ id: catalog.soloScheduleEntry.id }],
        },
        dancers: [
          {
            id: dancer.id,
            ageAtEventStart: 12,
          },
        ],
      },
    });
  });

  test("validates active Evento, registration window, and readiness before resolving the operation", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Estado",
      email: "registro.coreografia.estado@example.com",
    });
    const inactiveEvent = await createEventRecord({ active: false });
    const inactiveCatalog = await createEventCatalog(inactiveEvent.id);
    const closedEvent = await createEventRecord({
      active: true,
      registrationEndsAt: date("2000-04-30T12:00:00Z"),
    });
    const closedCatalog = await createEventCatalog(closedEvent.id);
    const dancer = await createDancer(owner.academyId);

    await expect(
      resolveChoreographyRegistrationOperation({
        academyId: owner.academyId,
        eventId: inactiveEvent.id,
        modalityId: inactiveCatalog.modality.id,
        submodalityId: inactiveCatalog.submodality.id,
        dancerIds: [dancer.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "event-not-active",
    });

    await expect(
      resolveChoreographyRegistrationOperation({
        academyId: owner.academyId,
        eventId: closedEvent.id,
        modalityId: closedCatalog.modality.id,
        submodalityId: closedCatalog.submodality.id,
        dancerIds: [dancer.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "registration-closed",
    });

    await db
      .update(events)
      .set({ active: false })
      .where(eq(events.id, closedEvent.id));

    const notReadyEvent = await createEventRecord({
      active: true,
      registrationEndsAt: date("2099-04-30T12:00:00Z"),
    });
    const [modality] = await db
      .insert(modalities)
      .values({
        eventId: notReadyEvent.id,
        name: `Jazz incompleto ${notReadyEvent.id}`,
      })
      .returning();

    await expect(
      resolveChoreographyRegistrationOperation({
        academyId: owner.academyId,
        eventId: notReadyEvent.id,
        modalityId: modality.id,
        submodalityId: null,
        dancerIds: [dancer.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "event-not-ready",
    });
  });

  test("calculates solo, duo, trio, and grupal from the selected Bailarín count", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Grupo",
      email: "registro.coreografia.grupo@example.com",
    });
    const event = await createEventRecord({
      active: true,
      registrationEndsAt: date("2099-04-30T12:00:00Z"),
    });
    const catalog = await createEventCatalog(event.id);
    const dancers = await Promise.all([
      createDancer(owner.academyId, { birthDate: "2013-01-01" }),
      createDancer(owner.academyId, { birthDate: "2012-01-01" }),
      createDancer(owner.academyId, { birthDate: "2011-01-01" }),
      createDancer(owner.academyId, { birthDate: "2010-01-01" }),
    ]);

    await expect(
      resolveChoreographyRegistrationOperation({
        academyId: owner.academyId,
        eventId: event.id,
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [dancers[0].id],
      }),
    ).resolves.toMatchObject({
      ok: true,
      resolution: { groupType: "solo" },
    });
    await expect(
      resolveChoreographyRegistrationOperation({
        academyId: owner.academyId,
        eventId: event.id,
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [dancers[0].id, dancers[1].id],
      }),
    ).resolves.toMatchObject({
      ok: true,
      resolution: { groupType: "duo" },
    });
    await expect(
      resolveChoreographyRegistrationOperation({
        academyId: owner.academyId,
        eventId: event.id,
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [dancers[0].id, dancers[1].id, dancers[2].id],
      }),
    ).resolves.toMatchObject({
      ok: true,
      resolution: { groupType: "trio" },
    });
    await expect(
      resolveChoreographyRegistrationOperation({
        academyId: owner.academyId,
        eventId: event.id,
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [dancers[0].id, dancers[1].id, dancers[2].id, dancers[3].id],
      }),
    ).resolves.toMatchObject({
      ok: true,
      resolution: { groupType: "grupal" },
    });
  });

  test("rejects missing required Submodalidad and Bailarines from another Academia", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Submodalidad",
      email: "registro.coreografia.submodalidad@example.com",
    });
    const other = await createAcademySession({
      academyName: "Academia Ajena Registro",
      email: "registro.coreografia.ajena@example.com",
    });
    const event = await createEventRecord({
      active: true,
      registrationEndsAt: date("2099-04-30T12:00:00Z"),
    });
    const catalog = await createEventCatalog(event.id);
    const ownerDancer = await createDancer(owner.academyId);
    const otherDancer = await createDancer(other.academyId);

    await expect(
      resolveChoreographyRegistrationOperation({
        academyId: owner.academyId,
        eventId: event.id,
        modalityId: catalog.modality.id,
        submodalityId: null,
        dancerIds: [ownerDancer.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "submodality-required",
    });

    await expect(
      resolveChoreographyRegistrationOperation({
        academyId: owner.academyId,
        eventId: event.id,
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [ownerDancer.id, otherDancer.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid-dancers",
    });
  });

  test("uses oldest age for duo and skips experience level when the resolved Categoría has no levels", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Dúo",
      email: "registro.coreografia.duo@example.com",
    });
    const event = await createEventRecord({
      active: true,
      registrationEndsAt: date("2099-04-30T12:00:00Z"),
    });
    const catalog = await createEventCatalog(event.id);
    const olderDancer = await createDancer(owner.academyId, {
      birthDate: "2012-01-01",
    });
    const youngerDancer = await createDancer(owner.academyId, {
      birthDate: "2014-01-01",
    });

    await expect(
      resolveChoreographyRegistrationOperation({
        academyId: owner.academyId,
        eventId: event.id,
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [olderDancer.id, youngerDancer.id],
      }),
    ).resolves.toMatchObject({
      ok: true,
      resolution: {
        groupType: "duo",
        category: {
          status: "resolved",
          id: catalog.teenCategory.id,
        },
        categoryCalculationMode: "oldest",
        categoryAgeBasis: 14,
        experienceLevel: {
          required: false,
          options: [],
        },
      },
    });
  });

  test("resolves grupal Categoría by tolerance and by integer average when tolerance does not apply", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Grupal",
      email: "registro.coreografia.grupal@example.com",
    });
    const event = await createEventRecord({
      active: true,
      registrationEndsAt: date("2099-04-30T12:00:00Z"),
    });
    const catalog = await createEventCatalog(event.id);
    const toleranceDancers = await Promise.all([
      createDancer(owner.academyId, { birthDate: "2015-01-01" }),
      createDancer(owner.academyId, { birthDate: "2015-01-02" }),
      createDancer(owner.academyId, { birthDate: "2015-01-03" }),
      createDancer(owner.academyId, { birthDate: "2015-01-04" }),
      createDancer(owner.academyId, { birthDate: "2013-01-01" }),
    ]);
    const averageDancers = await Promise.all([
      createDancer(owner.academyId, { birthDate: "2014-01-01" }),
      createDancer(owner.academyId, { birthDate: "2014-01-02" }),
      createDancer(owner.academyId, { birthDate: "2013-01-01" }),
      createDancer(owner.academyId, { birthDate: "2013-01-02" }),
      createDancer(owner.academyId, { birthDate: "2011-01-01" }),
    ]);

    await expect(
      resolveChoreographyRegistrationOperation({
        academyId: owner.academyId,
        eventId: event.id,
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: toleranceDancers.map((dancer) => dancer.id),
      }),
    ).resolves.toMatchObject({
      ok: true,
      resolution: {
        groupType: "grupal",
        category: {
          status: "resolved",
          id: catalog.childCategory.id,
        },
        categoryCalculationMode: "group_tolerance",
        categoryAgeBasis: null,
      },
    });

    await expect(
      resolveChoreographyRegistrationOperation({
        academyId: owner.academyId,
        eventId: event.id,
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: averageDancers.map((dancer) => dancer.id),
      }),
    ).resolves.toMatchObject({
      ok: true,
      resolution: {
        groupType: "grupal",
        category: {
          status: "resolved",
          id: catalog.teenCategory.id,
        },
        categoryCalculationMode: "group_average",
        categoryAgeBasis: 13,
      },
    });
  });

  test("allows Categoría pendiente and omits experience level when no Categoría is compatible", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Pendiente",
      email: "registro.coreografia.pendiente@example.com",
    });
    const event = await createEventRecord({
      active: true,
      registrationEndsAt: date("2099-04-30T12:00:00Z"),
    });
    const catalog = await createEventCatalog(event.id);
    const adultDancer = await createDancer(owner.academyId, {
      birthDate: "1990-01-01",
    });

    await expect(
      resolveChoreographyRegistrationOperation({
        academyId: owner.academyId,
        eventId: event.id,
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [adultDancer.id],
      }),
    ).resolves.toMatchObject({
      ok: true,
      resolution: {
        category: {
          status: "pending",
          reason: "no-compatible-category",
        },
        categoryCalculationMode: "oldest",
        categoryAgeBasis: 36,
        experienceLevel: {
          required: false,
          options: [],
        },
        schedule: {
          status: "auto",
          canConfirm: true,
        },
      },
    });
  });

  test("returns compatible Cronogramas when they exist and blocks confirmation with a clear message when none match the selection", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Cronograma",
      email: "registro.coreografia.cronograma@example.com",
    });
    const event = await createEventRecord({
      active: true,
      registrationEndsAt: date("2099-04-30T12:00:00Z"),
    });
    const catalog = await createEventCatalog(event.id);
    const [scheduleBlockTwo] = await db
      .insert(scheduleBlocks)
      .values({
        eventId: event.id,
        name: `Bloque dos ${event.id}`,
        scheduledDate: "2026-05-02",
        startTime: "18:00",
        totalCapacity: 10,
      })
      .returning();
    await db.insert(scheduleBlockModalities).values({
      scheduleBlockId: scheduleBlockTwo.id,
      modalityId: catalog.modality.id,
    });
    const [extraSoloEntry] = await db
      .insert(scheduleEntries)
      .values({
        scheduleBlockId: scheduleBlockTwo.id,
        groupTypes: ["solo"],
        groupTypeKey: "solo",
        capacity: 5,
      })
      .returning();
    const [soloOnlyModality] = await db
      .insert(modalities)
      .values({
        eventId: event.id,
        name: `Tap ${event.id}`,
      })
      .returning();
    const [soloOnlyCategory] = await db
      .insert(categories)
      .values({
        eventId: event.id,
        name: `Tap solo ${event.id}`,
        minAge: 8,
        maxAge: 12,
        groupTypes: ["solo"],
        groupTypeKey: "solo",
        experienceLevelKey: "",
      })
      .returning();
    await db.insert(categoryModalities).values({
      categoryId: soloOnlyCategory.id,
      modalityId: soloOnlyModality.id,
    });
    const [soloOnlyBlock] = await db
      .insert(scheduleBlocks)
      .values({
        eventId: event.id,
        name: `Bloque tap ${event.id}`,
        scheduledDate: "2026-05-03",
        startTime: "20:00",
        totalCapacity: 10,
      })
      .returning();
    await db.insert(scheduleBlockModalities).values({
      scheduleBlockId: soloOnlyBlock.id,
      modalityId: soloOnlyModality.id,
    });
    await db.insert(scheduleEntries).values({
      scheduleBlockId: soloOnlyBlock.id,
      groupTypes: ["solo"],
      groupTypeKey: "solo",
      capacity: 5,
    });
    const soloDancer = await createDancer(owner.academyId, {
      birthDate: "2014-01-01",
    });
    const groupDancers = await Promise.all([
      createDancer(owner.academyId, { birthDate: "2014-01-02" }),
      createDancer(owner.academyId, { birthDate: "2014-01-03" }),
      createDancer(owner.academyId, { birthDate: "2014-01-04" }),
      createDancer(owner.academyId, { birthDate: "2014-01-05" }),
    ]);

    await expect(
      resolveChoreographyRegistrationOperation({
        academyId: owner.academyId,
        eventId: event.id,
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [soloDancer.id],
      }),
    ).resolves.toMatchObject({
      ok: true,
      resolution: {
        schedule: {
          status: "multiple",
          canConfirm: true,
          options: expect.arrayContaining([
            expect.objectContaining({ id: catalog.soloScheduleEntry.id }),
            expect.objectContaining({ id: extraSoloEntry.id }),
          ]),
        },
      },
    });

    await expect(
      resolveChoreographyRegistrationOperation({
        academyId: owner.academyId,
        eventId: event.id,
        modalityId: soloOnlyModality.id,
        submodalityId: null,
        dancerIds: groupDancers.map((dancer) => dancer.id),
      }),
    ).resolves.toMatchObject({
      ok: true,
      resolution: {
        category: {
          status: "pending",
          reason: "no-compatible-category",
        },
        schedule: {
          status: "none",
          canConfirm: false,
          error:
            "No hay Cronogramas compatibles para la Modalidad y el Tipo de grupo seleccionados.",
        },
      },
    });
  });
});

async function createAcademySession({
  academyName,
  email,
}: {
  academyName: string;
  email: string;
}) {
  const signUpResult = await auth.api.signUpEmail({
    body: {
      email,
      name: email,
      password: "password-segura",
    },
    returnHeaders: true,
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
      phone: "11 1234-5678",
    })
    .returning();

  return {
    academyId: academy.id,
    cookie: createRequestCookie(signUpResult.headers),
  };
}

async function createEventRecord(
  overrides: Partial<typeof events.$inferInsert> = {},
) {
  if (overrides.active) {
    await db
      .update(events)
      .set({ active: false })
      .where(eq(events.active, true));
  }

  const [event] = await db
    .insert(events)
    .values({
      name: "Evento",
      active: false,
      programVisible: false,
      resultsVisible: false,
      requiredDepositPercentage: 30,
      registrationStartsAt: date("2026-03-01T12:00:00Z"),
      registrationEndsAt: date("2026-04-30T12:00:00Z"),
      startsAt: date("2026-05-01T12:00:00Z"),
      endsAt: date("2026-05-03T12:00:00Z"),
      ...overrides,
    })
    .returning();

  return event;
}

async function createEventCatalog(eventId: string) {
  const [modality] = await db
    .insert(modalities)
    .values({
      eventId,
      name: `Jazz ${eventId}`,
    })
    .returning();
  const [submodality] = await db
    .insert(submodalities)
    .values({
      eventId,
      modalityId: modality.id,
      name: `Lyrical ${eventId}`,
    })
    .returning();
  const [level] = await db
    .insert(experienceLevels)
    .values({
      eventId,
      name: `Inicial ${eventId}`,
    })
    .returning();
  const [childCategory] = await db
    .insert(categories)
    .values({
      eventId,
      name: `Infantil ${eventId}`,
      minAge: 8,
      maxAge: 12,
      groupTypes: ["solo", "duo", "trio", "grupal"],
      groupTypeKey: "duo|grupal|solo|trio",
      experienceLevelKey: level.id,
    })
    .returning();
  const [teenCategory] = await db
    .insert(categories)
    .values({
      eventId,
      name: `Juvenil ${eventId}`,
      minAge: 13,
      maxAge: 17,
      groupTypes: ["solo", "duo", "trio", "grupal"],
      groupTypeKey: "duo|grupal|solo|trio",
      experienceLevelKey: "",
    })
    .returning();
  await db.insert(categoryModalities).values([
    {
      categoryId: childCategory.id,
      modalityId: modality.id,
    },
    {
      categoryId: teenCategory.id,
      modalityId: modality.id,
    },
  ]);
  await db.insert(categoryExperienceLevels).values({
    categoryId: childCategory.id,
    experienceLevelId: level.id,
  });
  const [scheduleBlock] = await db
    .insert(scheduleBlocks)
    .values({
      eventId,
      name: `Bloque ${eventId}`,
      scheduledDate: "2026-05-01",
      startTime: "10:00",
      totalCapacity: 10,
    })
    .returning();
  await db.insert(scheduleBlockModalities).values({
    scheduleBlockId: scheduleBlock.id,
    modalityId: modality.id,
  });
  await db.insert(prices).values([
    {
      eventId,
      name: `Solo ${eventId}`,
      groupType: "solo",
      amount: 10000,
      scheduleBlockId: null,
    },
    {
      eventId,
      name: `Dúo ${eventId}`,
      groupType: "duo",
      amount: 15000,
      scheduleBlockId: null,
    },
    {
      eventId,
      name: `Trío ${eventId}`,
      groupType: "trio",
      amount: 20000,
      scheduleBlockId: null,
    },
    {
      eventId,
      name: `Grupal ${eventId}`,
      groupType: "grupal",
      amount: 25000,
      scheduleBlockId: null,
    },
  ]);
  const [
    soloScheduleEntry,
    duoScheduleEntry,
    trioScheduleEntry,
    grupalScheduleEntry,
  ] = await db
    .insert(scheduleEntries)
    .values([
      {
        scheduleBlockId: scheduleBlock.id,
        groupTypes: ["solo"],
        groupTypeKey: "solo",
        capacity: 5,
      },
      {
        scheduleBlockId: scheduleBlock.id,
        groupTypes: ["duo"],
        groupTypeKey: "duo",
        capacity: 5,
      },
      {
        scheduleBlockId: scheduleBlock.id,
        groupTypes: ["trio"],
        groupTypeKey: "trio",
        capacity: 5,
      },
      {
        scheduleBlockId: scheduleBlock.id,
        groupTypes: ["grupal"],
        groupTypeKey: "grupal",
        capacity: 5,
      },
    ])
    .returning();

  return {
    modality,
    submodality,
    level,
    childCategory,
    teenCategory,
    scheduleBlock,
    soloScheduleEntry,
    duoScheduleEntry,
    trioScheduleEntry,
    grupalScheduleEntry,
  };
}

async function createDancer(
  academyId: string,
  overrides: Partial<typeof dancers.$inferInsert> = {},
) {
  const [dancer] = await db
    .insert(dancers)
    .values({
      academyId,
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2012-01-10",
      active: true,
      ...overrides,
    })
    .returning();

  return dancer;
}

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected Better Auth to return a session cookie.");
  }

  const sessionCookie = setCookie.match(/better-auth\.session_token=([^;]+)/);

  if (!sessionCookie?.[1]) {
    throw new Error("Expected Better Auth to return a session cookie.");
  }

  return `better-auth.session_token=${sessionCookie[1]}`;
}

function date(value: string) {
  return new Date(value);
}
