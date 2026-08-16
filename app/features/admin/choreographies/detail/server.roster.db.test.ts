import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  paymentAllocations,
  payments,
  scheduleCapacities,
  scheduleModalities,
  schedules,
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

  // #709: when the assigned cupo is still compatible with the resolved
  // roster, the save must keep it as-is, even with other compatible cupos
  // available: `resolveSelectedScheduleCapacityIdForDancerUpdate` used to take
  // the first item of the list, which stopped being the assigned one the day
  // "keep-current" started carrying the full set.
  test("keeps the currently assigned cupo when it stays compatible after a roster change, even with another compatible cupo available", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Roster Cupo Compatible",
      email: "roster.cupo.compatible.academia@example.com",
    });
    const event = await createEventRecord({ active: true, name: "Regional" });
    const catalog = await createEventCatalog(event.id);
    // Scheduled earlier than `catalog`'s block: if the save picks "the first
    // in the list" instead of looking up the assigned one, this cupo wins.
    const [earlySchedule] = await db
      .insert(schedules)
      .values({
        eventId: event.id,
        name: `Bloque temprano ${event.id}`,
        scheduledDate: "2026-04-01",
        startTime: "10:00",
        totalCapacity: 10,
      })
      .returning();
    await db.insert(scheduleModalities).values({
      scheduleId: earlySchedule.id,
      modalityId: catalog.modality.id,
    });
    await db.insert(scheduleCapacities).values({
      scheduleId: earlySchedule.id,
      groupType: "duo",
      capacity: 5,
    });
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

    // Changes the roster (dancer swap) without touching the group type, so
    // the assigned cupo stays compatible ("keep-current") and no explicit
    // `scheduleCapacityId` travels in the submit.
    const response = await submitRoster({
      choreographyId: choreography.id,
      dancerIds: [dancerA.id, dancerC.id],
    });

    expect(response).toMatchObject({ status: "success" });

    const saved = await db.query.choreographies.findFirst({
      columns: { scheduleCapacityId: true },
      where: eq(choreographies.id, choreography.id),
    });
    expect(saved?.scheduleCapacityId).toBe(catalog.duoScheduleCapacity.id);
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

  // #730 repro (undo): a roster edit moves Solo -> Duo picking a Duo-exclusive
  // cupo, then a second submit undoes it back to Solo while the stale
  // Duo-exclusive `scheduleCapacityId` is still the one traveling in the
  // form. Needs a *second* schedule compatible with both group types so both
  // resolve to "multiple" (only one cupo per group type would resolve
  // "auto" and self-heal without ever consulting the submitted id at all).
  // Empirically (verified by running this test before adding the #730 guard)
  // the second submit was already rejected without corrupting the roster:
  // `resolveDancerUpdateScheduleSelection`'s "multiple" branch only accepts a
  // submitted `scheduleCapacityId` that is inside the *freshly resolved*
  // group type's own compatible set — a `scheduleCapacityId` filtered by
  // `groupType` at the query layer (`schedule-capacities.server.ts`) — so a
  // stale Duo id can never pass validation for a Solo resolution. This test
  // documents that outcome as a regression guard and doubles as a check that
  // the new #730 gate does not change it.
  test("does not persist a stale duo-exclusive cupo when a roster save undoes duo back to solo", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Roster Cupo Deshacer",
      email: "roster.cupo.deshacer@example.com",
    });
    const event = await createEventRecord({ active: true, name: "Regional" });
    const catalog = await createEventCatalog(event.id);
    const [secondSchedule] = await db
      .insert(schedules)
      .values({
        eventId: event.id,
        name: `Segundo bloque ${event.id}`,
        scheduledDate: "2026-04-01",
        startTime: "10:00",
        totalCapacity: 10,
      })
      .returning();
    await db.insert(scheduleModalities).values({
      scheduleId: secondSchedule.id,
      modalityId: catalog.modality.id,
    });
    await db.insert(scheduleCapacities).values([
      { scheduleId: secondSchedule.id, groupType: "solo", capacity: 5 },
      { scheduleId: secondSchedule.id, groupType: "duo", capacity: 5 },
    ]);
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
      name: "Solo",
      scheduleCapacityId: catalog.soloScheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancerA.id,
    });

    // Solo -> Duo, picking the Duo-exclusive cupo explicitly (both group
    // types resolve "multiple" here, so the pick is not self-healed).
    const grow = await submitRoster({
      choreographyId: choreography.id,
      dancerIds: [dancerA.id, dancerB.id],
      scheduleCapacityId: catalog.duoScheduleCapacity.id,
    });
    expect(grow).toMatchObject({ status: "success" });

    const afterGrow = await db.query.choreographies.findFirst({
      where: eq(choreographies.id, choreography.id),
    });
    expect(afterGrow?.groupType).toBe("duo");
    expect(afterGrow?.scheduleCapacityId).toBe(catalog.duoScheduleCapacity.id);

    // Undo Duo -> Solo, but the stale Duo-exclusive `scheduleCapacityId`
    // still travels in this submit (e.g. a form field that has not caught up
    // with the dancer-selection change yet).
    const undo = await submitRoster({
      choreographyId: choreography.id,
      dancerIds: [dancerA.id],
      scheduleCapacityId: catalog.duoScheduleCapacity.id,
    });

    expect(undo).not.toMatchObject({ status: "success" });

    const afterUndo = await db.query.choreographies.findFirst({
      where: eq(choreographies.id, choreography.id),
    });
    // Nothing about the second submit was persisted: still the Duo state the
    // first submit produced, not a Solo choreography sitting on the
    // Duo-exclusive cupo.
    expect(afterUndo?.groupType).toBe("duo");
    expect(afterUndo?.scheduleCapacityId).toBe(catalog.duoScheduleCapacity.id);

    const inscriptions = await db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, choreography.id),
    });
    expect(inscriptions.map((row) => row.dancerId).sort()).toEqual(
      [dancerA.id, dancerB.id].sort(),
    );
  });

  // Protects the #730 final compatibility gate itself: it must not reject a
  // legitimate save. `getScheduleSelectionId`/`isCompatibleScheduleCapacity`
  // are new call sites on the roster save path, so a wiring mistake there
  // (wrong argument order, wrong encoding for the specific-cupo case) would
  // show up as this test failing instead of as a silent false rejection.
  test("still saves a compatible cupo picked from a multiple-status resolution after the #730 final gate", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Roster Cupo Compatible Final",
      email: "roster.cupo.compatible.final@example.com",
    });
    const event = await createEventRecord({ active: true, name: "Regional" });
    const catalog = await createEventCatalog(event.id);
    const [secondSchedule] = await db
      .insert(schedules)
      .values({
        eventId: event.id,
        name: `Segundo bloque ${event.id}`,
        scheduledDate: "2026-04-01",
        startTime: "10:00",
        totalCapacity: 10,
      })
      .returning();
    await db.insert(scheduleModalities).values({
      scheduleId: secondSchedule.id,
      modalityId: catalog.modality.id,
    });
    const [secondSoloScheduleCapacity] = await db
      .insert(scheduleCapacities)
      .values({ scheduleId: secondSchedule.id, groupType: "solo", capacity: 5 })
      .returning();
    const [dancerA] = await Promise.all([
      createDancer(owner.academyId, { firstName: "Ana", lastName: "Uno" }),
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
    const dancerB = await createDancer(owner.academyId, {
      firstName: "Bea",
      lastName: "Dos",
    });
    await db
      .insert(choreographyDancers)
      .values([
        {
          ageAtEventStart: 14,
          choreographyId: choreography.id,
          dancerId: dancerB.id,
        },
      ]);

    // Duo -> Solo, resolving "multiple" for solo (two solo-compatible cupos
    // exist), explicitly picking the second schedule's cupo rather than the
    // catalog's default one.
    const result = await submitRoster({
      choreographyId: choreography.id,
      dancerIds: [dancerA.id],
      scheduleCapacityId: secondSoloScheduleCapacity.id,
    });

    expect(result).toMatchObject({ status: "success" });

    const saved = await db.query.choreographies.findFirst({
      where: eq(choreographies.id, choreography.id),
    });
    expect(saved?.groupType).toBe("solo");
    expect(saved?.scheduleCapacityId).toBe(secondSoloScheduleCapacity.id);
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
 * Solo with one inscription, `dancerA`, plus `dancerB` reserved to expand the
 * roster to duo in the schedule-capacity guard tests. Each call builds its own
 * event and catalog, so two choreographies never compete for the same cupo
 * unless explicitly asked to (see `createSoloScenarioInCatalog`, used by the
 * concurrency test).
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
 * Grupal with five inscriptions, `dancerA`'s ready to hang financial evidence
 * on. Removing one of the other four leaves four dancers, still "grupal"
 * (`deriveGroupType` only drops to trío at three): the group type, and with it
 * the cupo, doesn't move, so this scenario exercises the withdrawal-with-money
 * mechanism without crossing the cupo guard.
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
