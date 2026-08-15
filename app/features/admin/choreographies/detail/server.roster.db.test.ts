import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  paymentAllocations,
  payments,
  scheduleCapacities,
} from "@/db/schema";
import { handleChoreographyDetailAction } from "@/features/admin/choreographies/detail/server";
import {
  toChoreographyDetailViewActionData,
  updateChoreographyRosterIntent,
} from "@/features/admin/choreographies/detail/shared";
import { createChoreographyRecord } from "@/features/portal/choreographies/test-support/db";
import {
  createAcademySession,
  createDancer,
  createEventCatalog,
  createEventRecord,
} from "@/lib/choreographies/registration-test-fixtures.server.db";
import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";
import { recordComprobante } from "@/lib/comprobantes/comprobantes.server";

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

    expect(response).not.toBeInstanceOf(Response);
    expect(response).toMatchObject({
      message: "Coreografía guardada.",
      status: "success",
    });

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
    expect(added?.selectedPriceId).toBeNull();
  });

  test("hard-deletes a removed dancer whose inscription has no allocations and no comprobante line", async () => {
    const scenario = await createRemovalScenario({
      academyName: "Academia Roster Baja",
      email: "roster.baja.academia@example.com",
    });

    const response = await submitRoster({
      choreographyId: scenario.choreography.id,
      dancerIds: [scenario.dancerB.id],
    });

    expect(response).toMatchObject({ status: "success" });

    const inscriptions = await db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, scenario.choreography.id),
    });
    expect(inscriptions.map((row) => row.dancerId)).toEqual([
      scenario.dancerB.id,
    ]);
  });

  test("withdraws a removed dancer whose inscription holds money, and keeps the allocation on it", async () => {
    // Grupal, five dancers down to four: the group type (and with it the
    // cupo) stays "grupal" either way, so this exercises the withdrawal
    // mechanism in isolation from the cupo guard below.
    const scenario = await createGrupalRemovalScenario({
      academyName: "Academia Roster Retiro",
      email: "roster.retiro.academia@example.com",
    });
    const payment = await createPayment(scenario);
    await db.insert(paymentAllocations).values({
      academyId: scenario.academyId,
      amount: 3000,
      eventId: scenario.event.id,
      inscriptionId: scenario.inscriptionA.id,
      paymentId: payment.id,
    });

    const response = await submitRoster({
      choreographyId: scenario.choreography.id,
      dancerIds: scenario.remainingDancerIds,
    });

    expect(response).toMatchObject({ status: "success" });

    const withdrawn = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, scenario.inscriptionA.id),
    });
    expect(withdrawn?.withdrawnAt).toBeInstanceOf(Date);

    const allocations = await db.query.paymentAllocations.findMany({
      where: eq(paymentAllocations.inscriptionId, scenario.inscriptionA.id),
    });
    expect(allocations.map((row) => row.amount)).toEqual([3000]);

    const saved = await db.query.choreographies.findFirst({
      where: eq(choreographies.id, scenario.choreography.id),
    });
    expect(saved?.groupType).toBe("grupal");
  });

  test("withdraws a removed dancer whose inscription has a comprobante line", async () => {
    const scenario = await createRemovalScenario({
      academyName: "Academia Roster Facturada",
      email: "roster.facturada.academia@example.com",
    });
    await recordComprobante({
      cae: "75123456789012",
      caeVto: "20260801",
      cbteFch: "20260722",
      cbteNro: 1,
      cbteTipo: 11,
      choreographyId: scenario.choreography.id,
      eventId: scenario.event.id,
      impTotal: 10000,
      issuerCuit: "30717611590",
      issuerIvaCondition: "exento",
      lines: [{ amount: 10000, inscriptionId: scenario.inscriptionA.id }],
      ptoVta: 1,
      receptorDocNro: "0",
      receptorDocTipo: 99,
      receptorIvaConditionId: 5,
    });

    const response = await submitRoster({
      choreographyId: scenario.choreography.id,
      dancerIds: [scenario.dancerB.id],
    });

    expect(response).toMatchObject({ status: "success" });

    const withdrawn = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, scenario.inscriptionA.id),
    });
    expect(withdrawn?.withdrawnAt).toBeInstanceOf(Date);
  });

  test("revives the same inscription id when the withdrawn dancer is added again", async () => {
    const scenario = await createRemovalScenario({
      academyName: "Academia Roster Revive",
      email: "roster.revive.academia@example.com",
    });
    const payment = await createPayment(scenario);
    await db.insert(paymentAllocations).values({
      academyId: scenario.academyId,
      amount: 3000,
      eventId: scenario.event.id,
      inscriptionId: scenario.inscriptionA.id,
      paymentId: payment.id,
    });

    await submitRoster({
      choreographyId: scenario.choreography.id,
      dancerIds: [scenario.dancerB.id],
    });
    const response = await submitRoster({
      choreographyId: scenario.choreography.id,
      dancerIds: [scenario.dancerA.id, scenario.dancerB.id],
    });

    expect(response).toMatchObject({ status: "success" });

    const inscriptions = await db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, scenario.choreography.id),
    });
    const revived = inscriptions.find(
      (row) => row.dancerId === scenario.dancerA.id,
    );
    expect(inscriptions).toHaveLength(2);
    expect(revived?.id).toBe(scenario.inscriptionA.id);
    expect(revived?.withdrawnAt).toBeNull();
  });

  test("leaves the withdrawn row untouched when its allocations are removed afterwards", async () => {
    const scenario = await createRemovalScenario({
      academyName: "Academia Roster Desasigna",
      email: "roster.desasigna.academia@example.com",
    });
    const payment = await createPayment(scenario);
    const [allocation] = await db
      .insert(paymentAllocations)
      .values({
        academyId: scenario.academyId,
        amount: 3000,
        eventId: scenario.event.id,
        inscriptionId: scenario.inscriptionA.id,
        paymentId: payment.id,
      })
      .returning();

    await submitRoster({
      choreographyId: scenario.choreography.id,
      dancerIds: [scenario.dancerB.id],
    });
    const withdrawn = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, scenario.inscriptionA.id),
    });

    await db
      .delete(paymentAllocations)
      .where(eq(paymentAllocations.id, allocation.id));

    const afterDeallocation = await db.query.choreographyDancers.findFirst({
      where: eq(choreographyDancers.id, scenario.inscriptionA.id),
    });
    expect(afterDeallocation?.withdrawnAt).toEqual(withdrawn?.withdrawnAt);
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

    expect(response).not.toBeInstanceOf(Response);
    expect(response).toMatchObject({ status: "success" });

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

describe("cupo de cronograma guard on the roster path", () => {
  test("blocks a roster change that would move a choreography with money assigned", async () => {
    const scenario = await createSoloScenario({
      academyName: "Academia Roster Cupo Congelado",
      email: "roster.cupo.congelado@example.com",
    });
    const payment = await createPayment(scenario);
    await db.insert(paymentAllocations).values({
      academyId: scenario.academyId,
      amount: 3000,
      eventId: scenario.event.id,
      inscriptionId: scenario.inscriptionA.id,
      paymentId: payment.id,
    });

    const result = await submitRoster({
      choreographyId: scenario.choreography.id,
      dancerIds: [scenario.dancerA.id, scenario.dancerB.id],
    });

    // Must not be the roster section's own swallowed channel: the route
    // filters `status: "roster-error"` out before it reaches the view (see
    // `toChoreographyDetailViewActionData`), so this specific rejection has to
    // come back as a plain `status: "error"` to actually be visible.
    expect(result).toMatchObject({
      message:
        "No se puede cambiar el cupo de cronograma: hay inscripciones con dinero asignado.",
      status: "error",
    });
    expect(result).not.toBeInstanceOf(Response);
    if (!result || result instanceof Response) {
      throw new Error("Expected a blocked roster action.");
    }
    // Proves the rejection actually survives the route's status filter and
    // reaches the rendered page, not just that the server function returns an
    // error object.
    expect(toChoreographyDetailViewActionData(result)).toBe(result);

    const saved = await db.query.choreographies.findFirst({
      where: eq(choreographies.id, scenario.choreography.id),
    });
    expect(saved?.scheduleCapacityId).toBe(
      scenario.catalog.soloScheduleCapacity.id,
    );
    expect(saved?.groupType).toBe("solo");

    const inscriptions = await db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, scenario.choreography.id),
    });
    expect(inscriptions.map((row) => row.dancerId)).toEqual([
      scenario.dancerA.id,
    ]);
  });

  test("blocks a roster change that would move a choreography into a full cupo", async () => {
    const scenario = await createSoloScenario({
      academyName: "Academia Roster Cupo Lleno",
      email: "roster.cupo.lleno@example.com",
    });
    await db
      .update(scheduleCapacities)
      .set({ capacity: 1 })
      .where(
        eq(scheduleCapacities.id, scenario.catalog.duoScheduleCapacity.id),
      );
    const otherOwner = await createAcademySession({
      academyName: "Academia Roster Cupo Lleno Ocupante",
      email: "roster.cupo.lleno.ocupante@example.com",
    });
    await createChoreographyRecord({
      academyId: otherOwner.academyId,
      categoryId: scenario.catalog.teenCategory.id,
      eventId: scenario.event.id,
      groupType: "duo",
      modalityId: scenario.catalog.modality.id,
      name: "Duo Ocupante",
      scheduleCapacityId: scenario.catalog.duoScheduleCapacity.id,
      submodalityId: scenario.catalog.submodality.id,
    });

    const result = await submitRoster({
      choreographyId: scenario.choreography.id,
      dancerIds: [scenario.dancerA.id, scenario.dancerB.id],
    });

    expect(result).toMatchObject({
      message:
        "El cupo de cronograma seleccionado ya no tiene cupo disponible.",
      status: "error",
    });
    if (!result || result instanceof Response) {
      throw new Error("Expected a blocked roster action.");
    }
    expect(toChoreographyDetailViewActionData(result)).toBe(result);

    const saved = await db.query.choreographies.findFirst({
      where: eq(choreographies.id, scenario.choreography.id),
    });
    expect(saved?.scheduleCapacityId).toBe(
      scenario.catalog.soloScheduleCapacity.id,
    );
  });

  test("blocks removing a dancer whose money would otherwise move with a shrinking group type", async () => {
    // Duo down to solo: the group type recalculation is out of this ticket's
    // scope, but the cupo it lands on is not the same cupo the choreography
    // came from, and dancerA's money is still on the choreography at removal
    // time — this is the exact "corruption #619 exists to prevent," reached
    // through a roster removal instead of the standalone reassignment.
    const scenario = await createRemovalScenario({
      academyName: "Academia Roster Retiro Cupo",
      email: "roster.retiro.cupo@example.com",
    });
    const payment = await createPayment(scenario);
    await db.insert(paymentAllocations).values({
      academyId: scenario.academyId,
      amount: 3000,
      eventId: scenario.event.id,
      inscriptionId: scenario.inscriptionA.id,
      paymentId: payment.id,
    });

    const result = await submitRoster({
      choreographyId: scenario.choreography.id,
      dancerIds: [scenario.dancerB.id],
    });

    expect(result).toMatchObject({
      message:
        "No se puede cambiar el cupo de cronograma: hay inscripciones con dinero asignado.",
      status: "error",
    });

    const inscriptions = await db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, scenario.choreography.id),
    });
    expect(inscriptions.map((row) => row.dancerId).sort()).toEqual(
      [scenario.dancerA.id, scenario.dancerB.id].sort(),
    );
    expect(inscriptions.every((row) => row.withdrawnAt === null)).toBe(true);

    const saved = await db.query.choreographies.findFirst({
      where: eq(choreographies.id, scenario.choreography.id),
    });
    expect(saved?.groupType).toBe("duo");
  });

  test("does not guard a roster change that leaves the cupo untouched", async () => {
    const scenario = await createRemovalScenario({
      academyName: "Academia Roster Cupo Sin Cambio",
      email: "roster.cupo.sincambio@example.com",
    });
    const payment = await createPayment(scenario);
    await db.insert(paymentAllocations).values({
      academyId: scenario.academyId,
      amount: 3000,
      eventId: scenario.event.id,
      inscriptionId: scenario.inscriptionA.id,
      paymentId: payment.id,
    });
    const dancerC = await createDancer(scenario.academyId, {
      firstName: "Cami",
      lastName: "Tres",
    });

    // Swaps dancerB for dancerC, keeping the duo group type and the same
    // cupo. The frozen inscription belongs to dancerA, who is untouched — the
    // guard must not fire on a save that does not move the cupo.
    const result = await submitRoster({
      choreographyId: scenario.choreography.id,
      dancerIds: [scenario.dancerA.id, dancerC.id],
    });

    expect(result).toMatchObject({ status: "success" });
  });

  test("locks the destination cupo across two concurrent roster saves competing for the last slot", async () => {
    const event = await createEventRecord({ active: true, name: "Regional" });
    const catalog = await createEventCatalog(event.id);
    await db
      .update(scheduleCapacities)
      .set({ capacity: 1 })
      .where(eq(scheduleCapacities.id, catalog.duoScheduleCapacity.id));

    const [scenarioX, scenarioY] = await Promise.all([
      createSoloScenarioInCatalog({
        academyName: "Academia Roster Cupo Concurrente X",
        catalog,
        email: "roster.cupo.concurrente.x@example.com",
        event,
      }),
      createSoloScenarioInCatalog({
        academyName: "Academia Roster Cupo Concurrente Y",
        catalog,
        email: "roster.cupo.concurrente.y@example.com",
        event,
      }),
    ]);

    const [resultX, resultY] = await Promise.all([
      submitRoster({
        choreographyId: scenarioX.choreography.id,
        dancerIds: [scenarioX.dancerA.id, scenarioX.dancerB.id],
      }),
      submitRoster({
        choreographyId: scenarioY.choreography.id,
        dancerIds: [scenarioY.dancerA.id, scenarioY.dancerB.id],
      }),
    ]);

    const outcomes = [resultX, resultY].map((result) => {
      if (!result || result instanceof Response || !("status" in result)) {
        throw new Error("Expected a roster action result.");
      }
      return result.status;
    });

    // Both choreographies target the same cupo, which has exactly one free
    // slot: the lock must let exactly one of the two concurrent saves win it,
    // never both and never neither.
    expect(outcomes.filter((status) => status === "success")).toHaveLength(1);
    expect(outcomes.filter((status) => status === "error")).toHaveLength(1);

    const savedX = await db.query.choreographies.findFirst({
      where: eq(choreographies.id, scenarioX.choreography.id),
    });
    const savedY = await db.query.choreographies.findFirst({
      where: eq(choreographies.id, scenarioY.choreography.id),
    });
    const savedGroupTypes = [savedX?.groupType, savedY?.groupType];
    expect(savedGroupTypes.filter((value) => value === "duo")).toHaveLength(1);
    expect(savedGroupTypes.filter((value) => value === "solo")).toHaveLength(1);
  });
});

/**
 * Solo con una inscripción, `dancerA`, más `dancerB` reservado para expandir
 * el roster a duo en los tests de guardas del cupo de cronograma. Cada llamada
 * arma su propio evento y catálogo, así que dos coreografías nunca compiten
 * por el mismo cupo salvo que se pida explícitamente lo contrario (ver
 * `createSoloScenarioInCatalog`, usado por el test de concurrencia).
 */
async function createSoloScenario(input: {
  academyName: string;
  email: string;
}) {
  const event = await createEventRecord({ active: true, name: "Regional" });
  const catalog = await createEventCatalog(event.id);
  const scenario = await createSoloScenarioInCatalog({
    academyName: input.academyName,
    catalog,
    email: input.email,
    event,
  });

  return { ...scenario, catalog, event };
}

async function createSoloScenarioInCatalog(input: {
  academyName: string;
  catalog: Awaited<ReturnType<typeof createEventCatalog>>;
  email: string;
  event: { id: string };
}) {
  const owner = await createAcademySession({
    academyName: input.academyName,
    email: input.email,
  });
  const [dancerA, dancerB] = await Promise.all([
    createDancer(owner.academyId, { firstName: "Ana", lastName: "Uno" }),
    createDancer(owner.academyId, { firstName: "Bea", lastName: "Dos" }),
  ]);
  const choreography = await createChoreographyRecord({
    academyId: owner.academyId,
    categoryId: input.catalog.teenCategory.id,
    eventId: input.event.id,
    groupType: "solo",
    modalityId: input.catalog.modality.id,
    name: "Solo",
    scheduleCapacityId: input.catalog.soloScheduleCapacity.id,
    submodalityId: input.catalog.submodality.id,
  });
  const [inscriptionA] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancerA.id,
    })
    .returning();

  return {
    academyId: owner.academyId,
    choreography,
    dancerA,
    dancerB,
    inscriptionA,
  };
}

/**
 * Duo con dos inscripciones, la de `dancerA` lista para que el test le cuelgue
 * la evidencia que quiera probar. Quitarla del roster deja un solo bailarín, que
 * es la baja más simple que ejercita la decisión entre borrar y retirar.
 */
async function createRemovalScenario(input: {
  academyName: string;
  email: string;
}) {
  const owner = await createAcademySession({
    academyName: input.academyName,
    email: input.email,
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
    .values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancerA.id,
    })
    .returning();
  await db.insert(choreographyDancers).values({
    ageAtEventStart: 14,
    choreographyId: choreography.id,
    dancerId: dancerB.id,
  });

  return {
    academyId: owner.academyId,
    choreography,
    dancerA,
    dancerB,
    event,
    inscriptionA,
  };
}

/**
 * Grupal con cinco inscripciones, la de `dancerA` lista para colgarle
 * evidencia financiera. Quitar una de las otras cuatro deja cuatro bailarines,
 * que sigue siendo "grupal" (`deriveGroupType` recién baja a trío en tres): el
 * tipo de grupo, y con él el cupo, no se mueve, así que este escenario prueba
 * el mecanismo de retiro con dinero sin cruzarse con la guarda del cupo.
 */
async function createGrupalRemovalScenario(input: {
  academyName: string;
  email: string;
}) {
  const owner = await createAcademySession({
    academyName: input.academyName,
    email: input.email,
  });
  const event = await createEventRecord({ active: true, name: "Regional" });
  const catalog = await createEventCatalog(event.id);
  const dancers = await Promise.all([
    createDancer(owner.academyId, { firstName: "Ana", lastName: "Uno" }),
    createDancer(owner.academyId, { firstName: "Bea", lastName: "Dos" }),
    createDancer(owner.academyId, { firstName: "Cami", lastName: "Tres" }),
    createDancer(owner.academyId, { firstName: "Dana", lastName: "Cuatro" }),
    createDancer(owner.academyId, { firstName: "Eli", lastName: "Cinco" }),
  ]);
  const choreography = await createChoreographyRecord({
    academyId: owner.academyId,
    categoryId: catalog.teenCategory.id,
    eventId: event.id,
    groupType: "grupal",
    modalityId: catalog.modality.id,
    name: "Grupal",
    scheduleCapacityId: catalog.grupalScheduleCapacity.id,
    submodalityId: catalog.submodality.id,
  });
  const [inscriptionA] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancers[0].id,
    })
    .returning();
  await db.insert(choreographyDancers).values(
    dancers.slice(1).map((dancer) => ({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    })),
  );

  return {
    academyId: owner.academyId,
    choreography,
    event,
    inscriptionA,
    // dancers[0] (dancerA) is the one being removed; the rest stay, keeping
    // the group at four and the group type/cupo at "grupal".
    remainingDancerIds: dancers.slice(1).map((dancer) => dancer.id),
  };
}

async function createPayment(scenario: {
  academyId: string;
  event: { id: string };
}) {
  const [payment] = await db
    .insert(payments)
    .values({
      academyId: scenario.academyId,
      amount: 3000,
      eventId: scenario.event.id,
      paymentDate: "2026-03-20",
      paymentMethod: "transferencia",
      paymentNumber: 1,
    })
    .returning();

  return payment;
}

// El admin firmante se crea de cero en cada submit, así que el mail tiene que
// ser único también entre dos submits sobre la misma coreografía (retirar y
// volver a agregar es exactamente ese caso).
let submitCount = 0;

async function submitRoster(input: {
  choreographyId: string;
  dancerIds: string[];
  name?: string;
  professorIds?: string[];
  experienceLevelId?: string;
  scheduleCapacityId?: string;
}) {
  const body = new FormData();
  body.set("intent", updateChoreographyRosterIntent);
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
    email: `admin.roster.${(submitCount += 1)}.${input.choreographyId}@example.com`,
    requestUrl: `http://localhost/administracion/coreografias/${input.choreographyId}`,
    role: "admin",
  });

  return await handleChoreographyDetailAction({
    params: { choreographyId: input.choreographyId },
    request,
  });
}
