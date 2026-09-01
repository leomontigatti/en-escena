import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  categories,
  categoryModalities,
  events,
  modalities,
  scheduleModalities,
  schedules,
  scheduleCapacities,
} from "@/db/schema";
import { createChoreographyRegistration } from "@/lib/choreographies/registration-confirmation.server";
import {
  deriveGroupType,
  resolveChoreographyRegistrationOperation,
} from "@/lib/choreographies/registration-resolution.server";
import {
  createAcademySession,
  createDancer,
  createEventCatalog,
  createEventRecord,
  createOpenEventCatalog,
  createProfessor,
  date,
  OPEN_REGISTRATION_ENDS_AT,
} from "@/lib/choreographies/registration-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("deriveGroupType", () => {
  test("maps dancer counts to the shared group type used by admin re-resolution", () => {
    expect(deriveGroupType(1)).toBe("solo");
    expect(deriveGroupType(2)).toBe("duo");
    expect(deriveGroupType(3)).toBe("trio");
    expect(deriveGroupType(4)).toBe("grupal");
    expect(deriveGroupType(9)).toBe("grupal");
  });
});

describe.sequential("choreography registration resolution", () => {
  test("resolves a valid solo registration using the evento local start date, required experience levels, and compatible cupos de cronograma", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Dueña",
      email: "registro.coreografia.owner@example.com",
    });
    const { event, catalog } = await createOpenEventCatalog({
      active: true,
      registrationStartsAt: date("2026-03-01T12:00:00Z"),
      registrationEndsAt: OPEN_REGISTRATION_ENDS_AT,
      startsAt: date("2026-05-01T02:30:00Z"),
    });
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
          options: [{ id: catalog.soloScheduleCapacity.id }],
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

  test("falls back to the cronograma global capacity when the matching cupo de cronograma does not exist", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Cupo Global",
      email: "registro.coreografia.global@example.com",
    });
    const { event, catalog } = await createOpenEventCatalog({ active: true });
    const dancer = await createDancer(owner.academyId, {
      birthDate: "2013-05-01",
    });

    await db
      .delete(scheduleCapacities)
      .where(eq(scheduleCapacities.id, catalog.soloScheduleCapacity.id));

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
        schedule: {
          status: "auto",
          canConfirm: true,
          scheduleCapacityId: `schedule:${catalog.schedule.id}:global`,
          options: [
            {
              id: `schedule:${catalog.schedule.id}:global`,
              scheduleId: catalog.schedule.id,
              scheduleCapacityId: null,
              usesGlobalCapacity: true,
              capacity: catalog.schedule.totalCapacity,
            },
          ],
        },
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
    const { event, catalog } = await createOpenEventCatalog();
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
    const { event, catalog } = await createOpenEventCatalog();
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

  test("names the archived Bailarín it rejects, and says nothing about an ajeno Bailarín's existence", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Alta Bailarines",
      email: "registro.coreografia.alta@example.com",
    });
    const other = await createAcademySession({
      academyName: "Academia Alta Ajena",
      email: "registro.coreografia.alta.ajena@example.com",
    });
    const { event, catalog } = await createOpenEventCatalog();
    const archivedDancer = await createDancer(owner.academyId, {
      firstName: "Lucía",
      lastName: "Ferrer",
      active: false,
    });
    const otherDancer = await createDancer(other.academyId, {
      firstName: "Mora",
      lastName: "Ajena",
    });

    await expect(
      resolveChoreographyRegistrationOperation({
        academyId: owner.academyId,
        eventId: event.id,
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [archivedDancer.id],
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid-dancers",
      error:
        "Lucía Ferrer está archivado. Reactivalo para poder agregarlo a la coreografía.",
    });

    const ajenaResult = await resolveChoreographyRegistrationOperation({
      academyId: owner.academyId,
      eventId: event.id,
      modalityId: catalog.modality.id,
      submodalityId: catalog.submodality.id,
      dancerIds: [otherDancer.id],
    });

    expect(ajenaResult).toMatchObject({
      ok: false,
      code: "invalid-dancers",
      error: "Elegí bailarines que pertenezcan a tu academia.",
    });
    expect(ajenaResult.ok ? "" : ajenaResult.error).not.toContain("Mora");
  });

  test("rejects a Bailarín that does not exist with the same wording as an ajeno one", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Alta Inexistente",
      email: "registro.coreografia.alta.inexistente@example.com",
    });
    const { event, catalog } = await createOpenEventCatalog();

    await expect(
      resolveChoreographyRegistrationOperation({
        academyId: owner.academyId,
        eventId: event.id,
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: ["dancer_inexistente"],
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid-dancers",
      error: "Elegí bailarines que pertenezcan a tu academia.",
    });
  });

  test("uses oldest age for duo and skips experience level when the resolved Categoría has no levels", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Dúo",
      email: "registro.coreografia.duo@example.com",
    });
    const { event, catalog } = await createOpenEventCatalog();
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
    const { event, catalog } = await createOpenEventCatalog();
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
    const { event, catalog } = await createOpenEventCatalog();
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

  test("returns compatible cupos de cronograma and falls back to cronograma global capacity when no specific cupo matches", async () => {
    const owner = await createAcademySession({
      academyName: "Academia cupo de cronograma",
      email: "registro.coreografia.cupo-cronograma@example.com",
    });
    const { event, catalog } = await createOpenEventCatalog();
    const [scheduleTwo] = await db
      .insert(schedules)
      .values({
        eventId: event.id,
        name: `Bloque dos ${event.id}`,
        scheduledDate: "2026-05-02",
        startTime: "18:00",
        totalCapacity: 10,
      })
      .returning();
    await db.insert(scheduleModalities).values({
      scheduleId: scheduleTwo.id,
      modalityId: catalog.modality.id,
    });
    const [extraSoloEntry] = await db
      .insert(scheduleCapacities)
      .values({
        scheduleId: scheduleTwo.id,
        groupType: "solo",
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
      .insert(schedules)
      .values({
        eventId: event.id,
        name: `Bloque tap ${event.id}`,
        scheduledDate: "2026-05-03",
        startTime: "20:00",
        totalCapacity: 10,
      })
      .returning();
    await db.insert(scheduleModalities).values({
      scheduleId: soloOnlyBlock.id,
      modalityId: soloOnlyModality.id,
    });
    await db.insert(scheduleCapacities).values({
      scheduleId: soloOnlyBlock.id,
      groupType: "solo",
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
            expect.objectContaining({ id: catalog.soloScheduleCapacity.id }),
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
          status: "auto",
          canConfirm: true,
          scheduleCapacityId: `schedule:${soloOnlyBlock.id}:global`,
          options: [
            expect.objectContaining({
              id: `schedule:${soloOnlyBlock.id}:global`,
              scheduleId: soloOnlyBlock.id,
              scheduleCapacityId: null,
              usesGlobalCapacity: true,
            }),
          ],
        },
      },
    });
  });
  test("labels the compatible cupos with their ocupación and marks the full ones", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Ocupación Portal",
      email: "registro.coreografia.ocupacion@example.com",
    });
    const { event, catalog } = await createOpenEventCatalog();
    const [scheduleTwo] = await db
      .insert(schedules)
      .values({
        eventId: event.id,
        name: `Bloque libre ${event.id}`,
        scheduledDate: "2026-05-02",
        startTime: "18:00",
        totalCapacity: 10,
      })
      .returning();
    await db.insert(scheduleModalities).values({
      scheduleId: scheduleTwo.id,
      modalityId: catalog.modality.id,
    });
    const [freeSoloEntry] = await db
      .insert(scheduleCapacities)
      .values({
        scheduleId: scheduleTwo.id,
        groupType: "solo",
        capacity: 5,
      })
      .returning();
    const registeredDancer = await createDancer(owner.academyId, {
      birthDate: "2014-01-01",
    });
    const professor = await createProfessor(owner.academyId);
    const registration = await createChoreographyRegistration({
      academyId: owner.academyId,
      dancerIds: [registeredDancer.id],
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Pieza ocupante",
      professorIds: [professor.id],
      scheduleCapacityId: catalog.soloScheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    if (!registration.ok) {
      throw new Error(`Unexpected registration failure: ${registration.error}`);
    }

    await db
      .update(scheduleCapacities)
      .set({ capacity: 1 })
      .where(eq(scheduleCapacities.id, catalog.soloScheduleCapacity.id));

    const newDancer = await createDancer(owner.academyId, {
      birthDate: "2014-02-02",
    });
    const result = await resolveChoreographyRegistrationOperation({
      academyId: owner.academyId,
      eventId: event.id,
      modalityId: catalog.modality.id,
      submodalityId: catalog.submodality.id,
      dancerIds: [newDancer.id],
    });

    expect(result).toMatchObject({
      ok: true,
      resolution: {
        schedule: {
          status: "multiple",
          options: expect.arrayContaining([
            expect.objectContaining({
              id: catalog.soloScheduleCapacity.id,
              isFull: true,
              label: expect.stringContaining("1/1 ocupados · sin cupo"),
            }),
            expect.objectContaining({
              id: freeSoloEntry.id,
              isFull: false,
              label: "2 de mayo de 2026 - 18:00 hs. · 0/5 ocupados",
            }),
          ]),
        },
      },
    });
  });
});
