import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  paymentAllocations,
  payments,
} from "@/db/schema";
import { handleAdministrativeChoreographyDetailAction } from "@/features/admin/choreographies/detail/server";
import { updateAdministrativeChoreographyRosterIntent } from "@/features/admin/choreographies/detail/shared";
import { createChoreographyRecord } from "@/features/portal/choreographies/test-support/db";
import { deriveInscriptionFinancialState } from "@/lib/finances/operational-summary-calculations.server";
import {
  createAcademySession,
  createDancer,
  createEventCatalog,
  createEventRecord,
} from "@/lib/choreographies/registration-test-fixtures.server.db";
import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe("administrative choreography roster editing", () => {
  test("adds a dancer as an impaga inscription and re-resolves the group type/category", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Roster Alta",
      email: "roster.alta.academia@example.com",
    });
    const event = await createEventRecord({ active: true, name: "Regional" });
    const catalog = await createEventCatalog(event.id);
    const [dancerA, dancerB, dancerC] = await Promise.all([
      createDancer(owner.academyId, { firstName: "Ana", lastName: "Uno" }),
      createDancer(owner.academyId, { firstName: "Bea", lastName: "Dos" }),
      createDancer(owner.academyId, { firstName: "Cami", lastName: "Tres" }),
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
    await db.insert(choreographyDancers).values([
      {
        ageAtEventStart: 14,
        choreographyId: choreography.id,
        dancerId: dancerA.id,
      },
      {
        ageAtEventStart: 14,
        choreographyId: choreography.id,
        dancerId: dancerB.id,
      },
    ]);

    const response = await submitRoster({
      choreographyId: choreography.id,
      dancerIds: [dancerA.id, dancerB.id, dancerC.id],
    });

    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) {
      throw new Error("Expected redirect response.");
    }
    expect(response.status).toBe(302);

    const updated = await db.query.choreographies.findFirst({
      columns: { groupType: true },
      where: eq(choreographies.id, choreography.id),
    });
    expect(updated?.groupType).toBe("trio");

    const inscriptions = await db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, choreography.id),
    });
    expect(inscriptions.map((row) => row.dancerId).sort()).toEqual(
      [dancerA.id, dancerB.id, dancerC.id].sort(),
    );
    const added = inscriptions.find((row) => row.dancerId === dancerC.id);
    expect(added).toBeDefined();
    expect(deriveInscriptionFinancialState(added!)).toBe("impaga");
  });

  test("removes a dancer physically and returns its allocations to the Saldo disponible", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Roster Baja",
      email: "roster.baja.academia@example.com",
    });
    const event = await createEventRecord({ active: true, name: "Regional" });
    const catalog = await createEventCatalog(event.id);
    const [dancerA, dancerB] = await Promise.all([
      createDancer(owner.academyId, { firstName: "Ana", lastName: "Uno" }),
      createDancer(owner.academyId, { firstName: "Bea", lastName: "Dos" }),
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
    const [inscriptionA] = await db
      .insert(choreographyDancers)
      .values([
        {
          ageAtEventStart: 14,
          choreographyId: choreography.id,
          dancerId: dancerA.id,
          depositReferenceDate: "2026-03-20",
          depositAmount: 3000,
          frozenBasePriceAmount: 15000,
        },
      ])
      .returning();
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancerB.id,
    });
    const [payment] = await db
      .insert(payments)
      .values({
        academyId: owner.academyId,
        amount: 3000,
        eventId: event.id,
        paymentDate: "2026-03-20",
        paymentMethod: "transferencia",
        paymentNumber: 1,
      })
      .returning();
    await db.insert(paymentAllocations).values({
      academyId: owner.academyId,
      allocationType: "deposit",
      amount: 3000,
      eventId: event.id,
      inscriptionId: inscriptionA.id,
      paymentId: payment.id,
    });

    const response = await submitRoster({
      choreographyId: choreography.id,
      dancerIds: [dancerB.id],
    });

    expect(response).toBeInstanceOf(Response);

    const inscriptions = await db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, choreography.id),
    });
    expect(inscriptions.map((row) => row.dancerId)).toEqual([dancerB.id]);

    const remainingAllocations = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.paymentId, payment.id),
    });
    expect(remainingAllocations).toEqual([]);
  });

  test("keeps señada inscriptions when the roster changes (marca de agua)", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Roster Marca",
      email: "roster.marca.academia@example.com",
    });
    const event = await createEventRecord({ active: true, name: "Regional" });
    const catalog = await createEventCatalog(event.id);
    const [dancerA, dancerB, dancerC] = await Promise.all([
      createDancer(owner.academyId, { firstName: "Ana", lastName: "Uno" }),
      createDancer(owner.academyId, { firstName: "Bea", lastName: "Dos" }),
      createDancer(owner.academyId, { firstName: "Cami", lastName: "Tres" }),
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
    await db.insert(choreographyDancers).values([
      {
        ageAtEventStart: 14,
        choreographyId: choreography.id,
        dancerId: dancerA.id,
        depositReferenceDate: "2026-03-20",
        depositAmount: 3000,
        frozenBasePriceAmount: 15000,
      },
      {
        ageAtEventStart: 14,
        choreographyId: choreography.id,
        dancerId: dancerB.id,
        depositReferenceDate: "2026-03-20",
        depositAmount: 3000,
        frozenBasePriceAmount: 15000,
      },
    ]);

    const response = await submitRoster({
      choreographyId: choreography.id,
      dancerIds: [dancerA.id, dancerB.id, dancerC.id],
    });

    expect(response).toBeInstanceOf(Response);

    const inscriptions = await db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, choreography.id),
    });
    const kept = inscriptions.filter((row) => row.dancerId !== dancerC.id);
    expect(kept).toHaveLength(2);
    for (const inscription of kept) {
      expect(deriveInscriptionFinancialState(inscription)).toBe("señada");
    }
    const added = inscriptions.find((row) => row.dancerId === dancerC.id);
    expect(deriveInscriptionFinancialState(added!)).toBe("impaga");
  });

  test("hard-locks roster editing when the choreography has a presentation", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Roster Lock",
      email: "roster.lock.academia@example.com",
    });
    const event = await createEventRecord({ active: true, name: "Regional" });
    const catalog = await createEventCatalog(event.id);
    const [dancerA, dancerB] = await Promise.all([
      createDancer(owner.academyId, { firstName: "Ana", lastName: "Uno" }),
      createDancer(owner.academyId, { firstName: "Bea", lastName: "Dos" }),
    ]);
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.teenCategory.id,
      eventId: event.id,
      groupType: "solo",
      hasPresentation: true,
      modalityId: catalog.modality.id,
      name: "Solo",
      scheduleCapacityId: catalog.soloScheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancerA.id,
    });

    const result = await submitRoster({
      choreographyId: choreography.id,
      dancerIds: [dancerA.id, dancerB.id],
    });

    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) {
      throw new Error("Expected a blocked roster action, got a redirect.");
    }
    expect(result).toMatchObject({ status: "roster-error" });

    const inscriptions = await db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, choreography.id),
    });
    expect(inscriptions.map((row) => row.dancerId)).toEqual([dancerA.id]);
  });

  test("saves the name and the roster in a single submit", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Roster Nombre",
      email: "roster.nombre.academia@example.com",
    });
    const event = await createEventRecord({ active: true, name: "Regional" });
    const catalog = await createEventCatalog(event.id);
    const [dancerA, dancerB] = await Promise.all([
      createDancer(owner.academyId, { firstName: "Ana", lastName: "Uno" }),
      createDancer(owner.academyId, { firstName: "Bea", lastName: "Dos" }),
    ]);
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.teenCategory.id,
      eventId: event.id,
      groupType: "solo",
      modalityId: catalog.modality.id,
      name: "Nombre viejo",
      scheduleCapacityId: catalog.soloScheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancerA.id,
    });

    const response = await submitRoster({
      choreographyId: choreography.id,
      dancerIds: [dancerA.id, dancerB.id],
      name: "Nombre nuevo",
      scheduleCapacityId: catalog.duoScheduleCapacity.id,
    });

    expect(response).toBeInstanceOf(Response);

    const saved = await db.query.choreographies.findFirst({
      where: eq(choreographies.id, choreography.id),
    });

    expect(saved?.name).toBe("Nombre nuevo");
    expect(saved?.groupType).toBe("duo");
  });

  test("keeps the current name when the submit does not carry one", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Roster Sin Nombre",
      email: "roster.sinnombre.academia@example.com",
    });
    const event = await createEventRecord({ active: true, name: "Regional" });
    const catalog = await createEventCatalog(event.id);
    const [dancerA, dancerB] = await Promise.all([
      createDancer(owner.academyId, { firstName: "Ana", lastName: "Uno" }),
      createDancer(owner.academyId, { firstName: "Bea", lastName: "Dos" }),
    ]);
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.teenCategory.id,
      eventId: event.id,
      groupType: "solo",
      modalityId: catalog.modality.id,
      name: "Nombre intacto",
      scheduleCapacityId: catalog.soloScheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancerA.id,
    });

    await submitRoster({
      choreographyId: choreography.id,
      dancerIds: [dancerA.id, dancerB.id],
      scheduleCapacityId: catalog.duoScheduleCapacity.id,
    });

    const saved = await db.query.choreographies.findFirst({
      where: eq(choreographies.id, choreography.id),
    });

    expect(saved?.name).toBe("Nombre intacto");
  });

  test("rejects an empty name without touching the roster", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Roster Nombre Vacío",
      email: "roster.vacio.academia@example.com",
    });
    const event = await createEventRecord({ active: true, name: "Regional" });
    const catalog = await createEventCatalog(event.id);
    const [dancerA, dancerB] = await Promise.all([
      createDancer(owner.academyId, { firstName: "Ana", lastName: "Uno" }),
      createDancer(owner.academyId, { firstName: "Bea", lastName: "Dos" }),
    ]);
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.teenCategory.id,
      eventId: event.id,
      groupType: "solo",
      modalityId: catalog.modality.id,
      name: "Nombre intacto",
      scheduleCapacityId: catalog.soloScheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancerA.id,
    });

    const result = await submitRoster({
      choreographyId: choreography.id,
      dancerIds: [dancerA.id, dancerB.id],
      name: "   ",
      scheduleCapacityId: catalog.duoScheduleCapacity.id,
    });

    expect(result).toMatchObject({ status: "error" });

    const inscriptions = await db
      .select({ dancerId: choreographyDancers.dancerId })
      .from(choreographyDancers)
      .where(eq(choreographyDancers.choreographyId, choreography.id));

    expect(inscriptions.map((row) => row.dancerId)).toEqual([dancerA.id]);
  });
});

async function submitRoster(input: {
  choreographyId: string;
  dancerIds: string[];
  name?: string;
  professorIds?: string[];
  experienceLevelId?: string;
  scheduleCapacityId?: string;
}) {
  const body = new FormData();
  body.set("intent", updateAdministrativeChoreographyRosterIntent);
  if (input.name !== undefined) {
    body.set("name", input.name);
  }
  for (const dancerId of input.dancerIds) {
    body.append("dancerIds", dancerId);
  }
  for (const professorId of input.professorIds ?? []) {
    body.append("professorIds", professorId);
  }
  if (input.experienceLevelId) {
    body.set("experienceLevelId", input.experienceLevelId);
  }
  if (input.scheduleCapacityId) {
    body.set("scheduleCapacityId", input.scheduleCapacityId);
  }

  const { request } = await createSignedInAdminRequest({
    body,
    email: `admin.roster.${input.choreographyId}@example.com`,
    requestUrl: `http://localhost/administracion/coreografias/${input.choreographyId}`,
    role: "admin",
  });

  return await handleAdministrativeChoreographyDetailAction({
    params: { choreographyId: input.choreographyId },
    request,
  });
}
