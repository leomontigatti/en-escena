import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographyDancers, choreographyProfessors } from "@/db/schema";
import { createChoreographyRecord } from "@/features/portal/choreographies/test-support/db";
import {
  createAcademySession,
  createDancer,
  createEventCatalog,
  createEventRecord,
  createProfessor,
} from "@/lib/choreographies/registration-test-fixtures.server.db";
import {
  listDancerOptionsForChoreography,
  listProfessorOptionsForChoreography,
} from "@/lib/portal/choreographies.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

async function createRosterScenario(input: {
  academyName: string;
  email: string;
}) {
  const owner = await createAcademySession(input);
  const event = await createEventRecord({ active: true, name: "Regional" });
  const catalog = await createEventCatalog(event.id);
  const [
    activeLinkedDancer,
    activeUnlinkedDancer,
    archivedLinkedDancer,
    archivedUnlinkedDancer,
  ] = await Promise.all([
    createDancer(owner.academyId, { firstName: "Ana", lastName: "Activa" }),
    createDancer(owner.academyId, { firstName: "Bea", lastName: "Activa" }),
    createDancer(owner.academyId, {
      active: false,
      firstName: "Cami",
      lastName: "Archivada",
    }),
    createDancer(owner.academyId, {
      active: false,
      firstName: "Dana",
      lastName: "Archivada",
    }),
  ]);
  const [
    activeLinkedProfessor,
    activeUnlinkedProfessor,
    archivedLinkedProfessor,
    archivedUnlinkedProfessor,
  ] = await Promise.all([
    createProfessor(owner.academyId, { firstName: "Eva", lastName: "Activa" }),
    createProfessor(owner.academyId, { firstName: "Flor", lastName: "Activa" }),
    createProfessor(owner.academyId, {
      active: false,
      firstName: "Gala",
      lastName: "Archivada",
    }),
    createProfessor(owner.academyId, {
      active: false,
      firstName: "Hana",
      lastName: "Archivada",
    }),
  ]);
  const choreography = await createChoreographyRecord({
    academyId: owner.academyId,
    categoryId: catalog.teenCategory.id,
    eventId: event.id,
    groupType: "duo",
    modalityId: catalog.modality.id,
    name: "Duo",
    scheduleCapacityId: catalog.duoScheduleCapacity.id,
    submodalityId: catalog.submodality.id,
  });
  await db.insert(choreographyDancers).values(
    [activeLinkedDancer.id, archivedLinkedDancer.id].map((dancerId) => ({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId,
    })),
  );
  await db.insert(choreographyProfessors).values(
    [activeLinkedProfessor.id, archivedLinkedProfessor.id].map(
      (professorId) => ({
        choreographyId: choreography.id,
        professorId,
      }),
    ),
  );

  return {
    academyId: owner.academyId,
    activeLinkedDancer,
    activeLinkedProfessor,
    activeUnlinkedDancer,
    activeUnlinkedProfessor,
    archivedLinkedDancer,
    archivedLinkedProfessor,
    archivedUnlinkedDancer,
    archivedUnlinkedProfessor,
    choreography,
  };
}

describe("the roster pickers, as the eligibility rule seen from the portal", () => {
  test("offers every dancer but the archived one who is not on this coreografía", async () => {
    const scenario = await createRosterScenario({
      academyName: "Academia Picker Bailarines",
      email: "picker.bailarines@example.com",
    });

    const options = await listDancerOptionsForChoreography(scenario.academyId, [
      scenario.activeLinkedDancer.id,
      scenario.archivedLinkedDancer.id,
    ]);

    expect(options.map((option) => option.id).sort()).toEqual(
      [
        scenario.activeLinkedDancer.id,
        scenario.activeUnlinkedDancer.id,
        scenario.archivedLinkedDancer.id,
      ].sort(),
    );
    expect(options.map((option) => option.id)).not.toContain(
      scenario.archivedUnlinkedDancer.id,
    );
  });

  test("offers every profesor but the archived one who is not on this coreografía", async () => {
    const scenario = await createRosterScenario({
      academyName: "Academia Picker Profesores",
      email: "picker.profesores@example.com",
    });

    const options = await listProfessorOptionsForChoreography(
      scenario.academyId,
      [scenario.activeLinkedProfessor.id, scenario.archivedLinkedProfessor.id],
    );

    expect(options.map((option) => option.id).sort()).toEqual(
      [
        scenario.activeLinkedProfessor.id,
        scenario.activeUnlinkedProfessor.id,
        scenario.archivedLinkedProfessor.id,
      ].sort(),
    );
    expect(options.map((option) => option.id)).not.toContain(
      scenario.archivedUnlinkedProfessor.id,
    );
  });

  test("stops offering an archived person once they leave the coreografía's roster", async () => {
    const scenario = await createRosterScenario({
      academyName: "Academia Picker Sin Vínculo",
      email: "picker.sin.vinculo@example.com",
    });

    const options = await listDancerOptionsForChoreography(scenario.academyId, [
      scenario.activeLinkedDancer.id,
    ]);

    expect(options.map((option) => option.id)).not.toContain(
      scenario.archivedLinkedDancer.id,
    );
  });
});
