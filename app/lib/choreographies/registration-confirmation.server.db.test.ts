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
  createProfessor,
} from "@/lib/choreographies/registration-test-fixtures.server.db";
import { createChoreographyRegistration } from "@/lib/choreographies/registration-confirmation.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("choreography registration confirmation", () => {
  test("creates a Coreografía with dancer age snapshots, Profesores, and normalized Spanish title case on final confirmation", async () => {
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
    const professor = await createProfessor(owner.academyId);

    await expect(
      createChoreographyRegistration({
        academyId: owner.academyId,
        eventId: event.id,
        name: "-",
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [dancer.id],
        professorIds: [professor.id],
        experienceLevelId: catalog.level.id,
        scheduleCapacityId: catalog.soloScheduleCapacity.id,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid-name",
      error: "Ingresá un nombre válido para la coreografía.",
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
    const professor = await createProfessor(owner.academyId);

    await expect(
      createChoreographyRegistration({
        academyId: owner.academyId,
        eventId: event.id,
        name: "Pieza con nivel alterado",
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [dancer.id],
        professorIds: [professor.id],
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
        professorIds: [professor.id],
        experienceLevelId: catalog.level.id,
        scheduleCapacityId: "schedule_fake",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid-schedule-capacity",
    });
  });

  test("rejects a Coreografía without Profesores on final confirmation", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Sin Profesores",
      email: "registro.coreografia.sin-profesores@example.com",
    });
    const { event, catalog } = await createOpenEventCatalog();
    const dancer = await createDancer(owner.academyId, {
      birthDate: "2014-05-01",
    });

    await expect(
      createChoreographyRegistration({
        academyId: owner.academyId,
        eventId: event.id,
        name: "Pieza sin profesores",
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [dancer.id],
        professorIds: [],
        experienceLevelId: catalog.level.id,
        scheduleCapacityId: catalog.soloScheduleCapacity.id,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid-professors",
      error: "Elegí uno o más profesores válidos para la coreografía.",
    });

    const storedChoreographies = await db.query.choreographies.findMany({
      where: eq(choreographies.academyId, owner.academyId),
    });
    expect(storedChoreographies).toHaveLength(0);
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

  test("names the archived professor it rejects, and says nothing about another academy's professor existing", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Alta Profesores",
      email: "registro.coreografia.profesor.alta@example.com",
    });
    const other = await createAcademySession({
      academyName: "Academia Alta Profesores Ajena",
      email: "registro.coreografia.profesor.alta.ajena@example.com",
    });
    const { event, catalog } = await createOpenEventCatalog();
    const dancer = await createDancer(owner.academyId, {
      birthDate: "2014-05-01",
    });
    const archivedProfessor = await createProfessor(owner.academyId, {
      firstName: "Nadia",
      lastName: "Roldán",
      active: false,
    });
    const otherProfessor = await createProfessor(other.academyId, {
      firstName: "Bruno",
      lastName: "Ajeno",
    });

    await expect(
      createChoreographyRegistration({
        academyId: owner.academyId,
        eventId: event.id,
        name: "Pieza con profesor archivado",
        modalityId: catalog.modality.id,
        submodalityId: catalog.submodality.id,
        dancerIds: [dancer.id],
        professorIds: [archivedProfessor.id],
        experienceLevelId: catalog.level.id,
        scheduleCapacityId: catalog.soloScheduleCapacity.id,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid-professors",
      error:
        "Nadia Roldán tiene Estado de alta Archivado. Reactivá a esa persona para poder agregarla a la coreografía.",
    });

    const ajenoResult = await createChoreographyRegistration({
      academyId: owner.academyId,
      eventId: event.id,
      name: "Pieza con profesor ajeno",
      modalityId: catalog.modality.id,
      submodalityId: catalog.submodality.id,
      dancerIds: [dancer.id],
      professorIds: [otherProfessor.id],
      experienceLevelId: catalog.level.id,
      scheduleCapacityId: catalog.soloScheduleCapacity.id,
    });

    expect(ajenoResult).toMatchObject({
      ok: false,
      code: "invalid-professors",
      error: "Elegí profesores que pertenezcan a tu academia.",
    });
    expect(ajenoResult.ok ? "" : ajenoResult.error).not.toContain("Bruno");

    const storedChoreographies = await db.query.choreographies.findMany({
      where: eq(choreographies.academyId, owner.academyId),
    });
    expect(storedChoreographies).toHaveLength(0);
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
    const professor = await createProfessor(owner.academyId);

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
        professorIds: [professor.id],
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
        professorIds: [professor.id],
        experienceLevelId: catalog.level.id,
        scheduleCapacityId: catalog.soloScheduleCapacity.id,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "schedule-capacity-full",
      error: "El cupo de cronograma seleccionado ya no tiene cupo disponible.",
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
    const professor = await createProfessor(owner.academyId);
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
        professorIds: [professor.id],
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
        professorIds: [professor.id],
        experienceLevelId: catalog.level.id,
        scheduleCapacityId: globalScheduleOptionId,
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "schedule-capacity-full",
      error: "El cronograma seleccionado ya no tiene cupo disponible.",
    });

    const storedChoreographies = await db.query.choreographies.findMany({
      where: eq(choreographies.academyId, owner.academyId),
    });
    expect(storedChoreographies).toHaveLength(1);
  });

  test("numbers choreographies from one per event, and restarts the count in another event", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Numeración",
      email: "registro.coreografia.numeracion@example.com",
    });
    const first = await createOpenEventCatalog();
    const firstDancer = await createDancer(owner.academyId, {
      birthDate: "2014-05-01",
      firstName: "ana",
      lastName: "paz",
    });
    const secondDancer = await createDancer(owner.academyId, {
      birthDate: "2014-06-01",
      firstName: "sol",
      lastName: "diaz",
    });
    const professor = await createProfessor(owner.academyId);

    const registerInFirstEvent = async (name: string, dancerId: string) =>
      await expectRegistered({
        academyId: owner.academyId,
        eventId: first.event.id,
        name,
        modalityId: first.catalog.modality.id,
        submodalityId: first.catalog.submodality.id,
        dancerIds: [dancerId],
        professorIds: [professor.id],
        experienceLevelId: first.catalog.level.id,
        scheduleCapacityId: first.catalog.soloScheduleCapacity.id,
      });

    await registerInFirstEvent("Primera pieza", firstDancer.id);
    await registerInFirstEvent("Segunda pieza", secondDancer.id);

    const firstEventNumbers = (
      await db.query.choreographies.findMany({
        where: eq(choreographies.eventId, first.event.id),
      })
    )
      .map((row) => row.choreographyNumber)
      .sort((a, b) => a - b);

    expect(firstEventNumbers).toEqual([1, 2]);

    // Numbering is per event, so the second event starts over at 1 instead of
    // continuing the first one's count.
    const second = await createOpenEventCatalog();
    const secondEventDancer = await createDancer(owner.academyId, {
      birthDate: "2014-07-01",
      firstName: "luz",
      lastName: "rios",
    });
    const secondEventProfessor = await createProfessor(owner.academyId);

    await expectRegistered({
      academyId: owner.academyId,
      eventId: second.event.id,
      name: "Pieza de otro evento",
      modalityId: second.catalog.modality.id,
      submodalityId: second.catalog.submodality.id,
      dancerIds: [secondEventDancer.id],
      professorIds: [secondEventProfessor.id],
      experienceLevelId: second.catalog.level.id,
      scheduleCapacityId: second.catalog.soloScheduleCapacity.id,
    });

    const secondEventNumbers = (
      await db.query.choreographies.findMany({
        where: eq(choreographies.eventId, second.event.id),
      })
    ).map((row) => row.choreographyNumber);

    expect(secondEventNumbers).toEqual([1]);
  });
});

async function expectRegistered(
  input: Parameters<typeof createChoreographyRegistration>[0],
) {
  const result = await createChoreographyRegistration(input);

  // Without this, a rejected creation would read later as "the event numbered
  // nothing" and the failure would point at the counter instead of the real
  // reason.
  expect(result).toMatchObject({ ok: true });

  return result;
}
