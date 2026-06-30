import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  professors,
  schedules,
  scheduleCapacities,
} from "@/db/schema";
import {
  createAcademySession,
  createDancer,
  createOpenEventCatalog,
} from "@/lib/choreographies/registration-test-fixtures.server.db";
import { createChoreographyRegistration } from "@/lib/choreographies/registration-confirmation.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("choreography registration confirmation", () => {
  test("creates a Coreografía with dancer age snapshots, optional Profesores, and normalized Spanish title case on final confirmation", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Confirmación",
      email: "registro.coreografia.confirmacion@example.com",
    });
    const { event, catalog } = await createOpenEventCatalog();
    const dancer = await createDancer(owner.academyId, {
      birthDate: "2014-05-01",
      firstName: "ana",
      lastName: "paz",
    });
    const [professor] = await db
      .insert(professors)
      .values({
        academyId: owner.academyId,
        firstName: "luz",
        lastName: "suarez",
        active: true,
      })
      .returning();

    await expect(
      createChoreographyRegistration({
        academyId: owner.academyId,
        eventId: event.id,
        name: "  danza   de la   luna y el sol ",
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [dancer.id],
        professorIds: [professor.id],
        experienceLevelId: catalog.level.id,
        scheduleCapacityId: catalog.soloScheduleCapacity.id,
      }),
    ).resolves.toMatchObject({
      ok: true,
      choreography: expect.objectContaining({
        eventId: event.id,
        academyId: owner.academyId,
        name: "Danza de la Luna y el Sol",
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        groupType: "solo",
        categoryId: catalog.childCategory.id,
        categoryCalculationMode: "oldest",
        categoryAgeBasis: 12,
        experienceLevelId: catalog.level.id,
        scheduleCapacityId: catalog.soloScheduleCapacity.id,
      }),
    });

    const storedChoreography = await db.query.choreographies.findFirst({
      where: eq(choreographies.academyId, owner.academyId),
    });
    expect(storedChoreography).toMatchObject({
      name: "Danza de la Luna y el Sol",
    });

    const storedDancerLinks = await db.query.choreographyDancers.findMany({
      where: eq(
        choreographyDancers.choreographyId,
        storedChoreography?.id ?? "",
      ),
    });
    expect(storedDancerLinks).toMatchObject([
      {
        dancerId: dancer.id,
        ageAtEventStart: 12,
      },
    ]);

    const storedProfessorLinks = await db.query.choreographyProfessors.findMany(
      {
        where: eq(
          choreographyProfessors.choreographyId,
          storedChoreography?.id ?? "",
        ),
      },
    );
    expect(storedProfessorLinks).toMatchObject([
      {
        professorId: professor.id,
      },
    ]);
  });

  test("rejects placeholder-only choreography names before inserting records", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Nombre Inválido",
      email: "registro.coreografia.nombre-invalido@example.com",
    });
    const { event, catalog } = await createOpenEventCatalog();
    const dancer = await createDancer(owner.academyId, {
      birthDate: "2014-05-01",
    });

    await expect(
      createChoreographyRegistration({
        academyId: owner.academyId,
        eventId: event.id,
        name: "-",
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [dancer.id],
        professorIds: [],
        experienceLevelId: catalog.level.id,
        scheduleCapacityId: catalog.soloScheduleCapacity.id,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid-name",
      error: "Ingresá un nombre válido para la Coreografía.",
    });

    const storedChoreographies = await db.query.choreographies.findMany({
      where: eq(choreographies.academyId, owner.academyId),
    });
    expect(storedChoreographies).toHaveLength(0);
  });

  test("revalidates Nivel and Cupo de cronograma on final confirmation and rejects stale or tampered payloads", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Revalidación",
      email: "registro.coreografia.revalidacion@example.com",
    });
    const { event, catalog } = await createOpenEventCatalog();
    const dancer = await createDancer(owner.academyId, {
      birthDate: "2014-05-01",
    });

    await expect(
      createChoreographyRegistration({
        academyId: owner.academyId,
        eventId: event.id,
        name: "Pieza con nivel alterado",
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [dancer.id],
        professorIds: [],
        experienceLevelId: "level_fake",
        scheduleCapacityId: catalog.soloScheduleCapacity.id,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid-experience-level",
    });

    await expect(
      createChoreographyRegistration({
        academyId: owner.academyId,
        eventId: event.id,
        name: "Pieza con cupo de cronograma alterado",
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [dancer.id],
        professorIds: [],
        experienceLevelId: catalog.level.id,
        scheduleCapacityId: "schedule_fake",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid-schedule-capacity",
    });
  });

  test("rejects Profesores from another Academia on final confirmation", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Profesores Propios",
      email: "registro.coreografia.profesor.owner@example.com",
    });
    const other = await createAcademySession({
      academyName: "Academia Profesores Ajena",
      email: "registro.coreografia.profesor.other@example.com",
    });
    const { event, catalog } = await createOpenEventCatalog();
    const dancer = await createDancer(owner.academyId, {
      birthDate: "2014-05-01",
    });
    const [otherProfessor] = await db
      .insert(professors)
      .values({
        academyId: other.academyId,
        firstName: "Profe",
        lastName: "Ajena",
        active: true,
      })
      .returning();

    await expect(
      createChoreographyRegistration({
        academyId: owner.academyId,
        eventId: event.id,
        name: "Pieza con profesor ajeno",
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [dancer.id],
        professorIds: [otherProfessor.id],
        experienceLevelId: catalog.level.id,
        scheduleCapacityId: catalog.soloScheduleCapacity.id,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid-professors",
    });
  });

  test("returns a clear cupo error and leaves no partial inserts when the selected Cupo de cronograma is already full", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Cupo",
      email: "registro.coreografia.cupo@example.com",
    });
    const { event, catalog } = await createOpenEventCatalog();
    const firstDancer = await createDancer(owner.academyId, {
      birthDate: "2014-05-01",
    });
    const secondDancer = await createDancer(owner.academyId, {
      birthDate: "2014-06-01",
    });

    await db
      .update(scheduleCapacities)
      .set({ capacity: 1 })
      .where(eq(scheduleCapacities.id, catalog.soloScheduleCapacity.id));

    await expect(
      createChoreographyRegistration({
        academyId: owner.academyId,
        eventId: event.id,
        name: "Primera pieza",
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [firstDancer.id],
        professorIds: [],
        experienceLevelId: catalog.level.id,
        scheduleCapacityId: catalog.soloScheduleCapacity.id,
      }),
    ).resolves.toMatchObject({
      ok: true,
    });

    await expect(
      createChoreographyRegistration({
        academyId: owner.academyId,
        eventId: event.id,
        name: "Segunda pieza",
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [secondDancer.id],
        professorIds: [],
        experienceLevelId: catalog.level.id,
        scheduleCapacityId: catalog.soloScheduleCapacity.id,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "schedule-capacity-full",
      error: "El Cupo de cronograma seleccionado ya no tiene cupo disponible.",
    });

    const storedChoreographies = await db.query.choreographies.findMany({
      where: eq(choreographies.academyId, owner.academyId),
    });
    expect(storedChoreographies).toHaveLength(1);

    const storedDancerLinks = await db.query.choreographyDancers.findMany();
    expect(storedDancerLinks).toHaveLength(1);
  });

  test("uses cronograma total capacity when confirming without a specific cupo de cronograma", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Cupo Global Confirmación",
      email: "registro.coreografia.global.confirmacion@example.com",
    });
    const { event, catalog } = await createOpenEventCatalog();
    const firstDancer = await createDancer(owner.academyId, {
      birthDate: "2014-05-01",
    });
    const secondDancer = await createDancer(owner.academyId, {
      birthDate: "2014-06-01",
    });
    const globalScheduleOptionId = `schedule:${catalog.schedule.id}:global`;

    await db
      .delete(scheduleCapacities)
      .where(eq(scheduleCapacities.id, catalog.soloScheduleCapacity.id));
    await db
      .update(schedules)
      .set({ totalCapacity: 1 })
      .where(eq(schedules.id, catalog.schedule.id));

    await expect(
      createChoreographyRegistration({
        academyId: owner.academyId,
        eventId: event.id,
        name: "Primera pieza global",
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [firstDancer.id],
        professorIds: [],
        experienceLevelId: catalog.level.id,
        scheduleCapacityId: globalScheduleOptionId,
      }),
    ).resolves.toMatchObject({
      ok: true,
      choreography: expect.objectContaining({
        scheduleId: catalog.schedule.id,
        scheduleCapacityId: null,
      }),
    });

    await expect(
      createChoreographyRegistration({
        academyId: owner.academyId,
        eventId: event.id,
        name: "Segunda pieza global",
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [secondDancer.id],
        professorIds: [],
        experienceLevelId: catalog.level.id,
        scheduleCapacityId: globalScheduleOptionId,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "schedule-capacity-full",
      error: "El Cronograma seleccionado ya no tiene cupo disponible.",
    });

    const storedChoreographies = await db.query.choreographies.findMany({
      where: eq(choreographies.academyId, owner.academyId),
    });
    expect(storedChoreographies).toHaveLength(1);
  });
});
