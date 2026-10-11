import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  presentations,
} from "@/db/schema";
import {
  createAcademySession,
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  createEventRecord,
  createProfessor,
  date,
  createSelectedPriceInscriptionForTest,
} from "@/features/portal/choreographies/test-support/db";
import {
  recordComprobante,
  type RecordComprobanteInput,
} from "@/lib/comprobantes/comprobantes.server";
import { readAcademyAvailableBalance } from "@/lib/finances/allocation-pool.server";
import { expectFlashRedirect } from "@/lib/shared/flash-notification.test-support";
import { choreographyAnchor } from "@/lib/comprobantes/anchor";
import { evaluatedChoreographyIds } from "@/lib/presentations/evaluation-lock.test-support";
import { expectThrownResponse } from "@/lib/test-support/http";
import {
  loadDetail,
  submitDetailAction,
  saveDraftEdits,
  submitDraftAsAuditor,
  deleteFormData,
} from "@/features/admin/choreographies/detail/server.test-support";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

// The evaluated lock is the seam the judging effort will fill; until then it
// answers `false` for everything, so a test that needs a closed choreography
// declares it here.
vi.mock(
  "@/lib/presentations/evaluation-lock.server",
  async () =>
    (await import("@/lib/presentations/evaluation-lock.test-support"))
      .evaluationLockStub,
);

beforeEach(() => {
  evaluatedChoreographyIds.clear();
});

installDatabaseTestHooks();

describe("administrative choreography detail: access, rename, delete and withdraw", () => {
  test("allows admin and auditor access, blocks non-admin-panel roles, and only resolves active-event choreographies", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Detalle",
      email: "admin.coreografias.detalle.academia@example.com",
    });
    const activeEvent = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const inactiveEvent = await createEventRecord({
      active: false,
      name: "Regional 2025",
      startsAt: date("2025-05-01T12:00:00Z"),
      endsAt: date("2025-05-03T12:00:00Z"),
    });
    const activeCatalog = await createEventCatalog(activeEvent.id);
    const inactiveCatalog = await createEventCatalog(inactiveEvent.id);
    const activeChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: activeCatalog.categoryWithLevel.id,
      eventId: activeEvent.id,
      experienceLevelId: activeCatalog.level.id,
      modalityId: activeCatalog.modality.id,
      name: "Activa",
      scheduleCapacityId: activeCatalog.scheduleCapacity.id,
      submodalityId: activeCatalog.submodality.id,
    });
    const inactiveChoreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: inactiveCatalog.categoryWithLevel.id,
      eventId: inactiveEvent.id,
      experienceLevelId: inactiveCatalog.level.id,
      modalityId: inactiveCatalog.modality.id,
      name: "Histórica",
      scheduleCapacityId: inactiveCatalog.scheduleCapacity.id,
      submodalityId: inactiveCatalog.submodality.id,
    });

    const adminData = await loadDetail({
      choreographyId: activeChoreography.id,
      email: "admin.coreografias.detalle@example.com",
      role: "admin",
    });
    const auditorData = await loadDetail({
      choreographyId: activeChoreography.id,
      email: "auditor.coreografias.detalle@example.com",
      role: "auditor",
    });

    expect(adminData.canEdit).toBe(true);
    expect(auditorData.canEdit).toBe(false);
    expect(adminData.selectedEventId).toBe(activeEvent.id);
    expect(adminData.choreography).toMatchObject({
      academyName: "Academia Detalle",
      id: activeChoreography.id,
      name: "Activa",
    });

    await expectThrownResponse(
      loadDetail({
        choreographyId: activeChoreography.id,
        email: "academy.coreografias.detalle@example.com",
        role: "academy",
      }),
      403,
    );
    await expectThrownResponse(
      loadDetail({
        choreographyId: activeChoreography.id,
        email: "judge.coreografias.detalle@example.com",
        role: "judge",
      }),
      403,
    );
    await expectThrownResponse(
      loadDetail({
        choreographyId: inactiveChoreography.id,
        email: "admin.coreografias.detalle.inactiva@example.com",
        role: "admin",
      }),
      404,
    );
  });

  test("renames active-event choreographies for admins and refuses auditors", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Renombre",
      email: "admin.coreografias.renombre.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Nombre anterior",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    const response = await saveDraftEdits({
      choreographyId: choreography.id,
      edits: { name: "Nombre nuevo" },
    });

    expect(response).not.toBeInstanceOf(Response);
    expect(response).toMatchObject({
      message: "Coreografía guardada.",
      status: "success",
    });
    await expect(
      db.query.choreographies.findFirst({
        columns: { name: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toEqual({ name: "Nombre Nuevo" });

    await expectThrownResponse(
      submitDraftAsAuditor({
        choreographyId: choreography.id,
        edits: { name: "Intento auditor" },
      }),
      403,
    );
    await expect(
      db.query.choreographies.findFirst({
        columns: { name: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toEqual({ name: "Nombre Nuevo" });
  });

  test("deletes eligible active-event choreographies and cascades roster links", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Eliminar",
      email: "admin.coreografias.eliminar.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const dancer = await createDancer(owner.academyId, {
      firstName: "Ana",
      lastName: "Paz",
    });
    const professor = await createProfessor(owner.academyId, {
      firstName: "Luz",
      lastName: "Suárez",
    });
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Sin bloqueos",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    });
    await db.insert(choreographyProfessors).values({
      choreographyId: choreography.id,
      professorId: professor.id,
    });

    const response = await submitDetailAction({
      body: deleteFormData(),
      choreographyId: choreography.id,
      email: "admin.coreografias.eliminar@example.com",
      role: "admin",
    });

    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) {
      throw new Error("Expected redirect response.");
    }
    expect(response.status).toBe(302);
    await expectFlashRedirect(response, "/administracion/coreografias", {
      id: "route-notification:choreography-deleted",
      message: "Coreografía eliminada.",
      variant: "success",
    });
    await expect(
      db.query.choreographies.findFirst({
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toBeUndefined();
    await expect(
      db.query.choreographyDancers.findMany({
        where: eq(choreographyDancers.choreographyId, choreography.id),
      }),
    ).resolves.toEqual([]);
    await expect(
      db.query.choreographyProfessors.findMany({
        where: eq(choreographyProfessors.choreographyId, choreography.id),
      }),
    ).resolves.toEqual([]);
  });

  // A presentation is not a blocker: it goes with the choreography, in the same
  // transaction, and the number it held stays a gap so that no other
  // choreography is renumbered behind the academies' backs.
  test("deletes the presentation of a numbered choreography and leaves its number as a gap", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Numerada",
      email: "admin.coreografias.numerada.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const numbered = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Numerada",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const neighbour = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Vecina",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await db.insert(presentations).values([
      { choreographyId: numbered.id, eventId: event.id, orderNumber: 1 },
      { choreographyId: neighbour.id, eventId: event.id, orderNumber: 2 },
    ]);

    await expect(loadDeleteBlockers(numbered.id)).resolves.toEqual([]);
    await expect(loadRemovalOutcome(numbered.id)).resolves.toBe("deleted");

    const response = await submitDetailAction({
      body: deleteFormData(),
      choreographyId: numbered.id,
      email: "admin.coreografias.numerada@example.com",
      role: "admin",
    });

    expect(response).toBeInstanceOf(Response);
    await expect(
      db.query.choreographies.findFirst({
        where: eq(choreographies.id, numbered.id),
      }),
    ).resolves.toBeUndefined();
    await expect(
      db.query.presentations.findMany({
        where: eq(presentations.eventId, event.id),
      }),
    ).resolves.toMatchObject([
      { choreographyId: neighbour.id, orderNumber: 2 },
    ]);
  });

  // A comprobante no longer refuses the removal (#340's permanent block is
  // reversed): the fiscal history is exactly what has to survive, so the
  // choreography is withdrawn instead of deleted.
  test("withdraws a choreography whose inscription carries a comprobante line, with no money allocated", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Fiscal",
      email: "admin.coreografias.fiscal.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const invoiced = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Facturada",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const inscription = await createSelectedPriceInscriptionForTest({
      academyId: owner.academyId,
      choreographyId: invoiced.id,
    });

    await recordComprobante(
      facturaCInput({
        choreographyId: invoiced.id,
        eventId: event.id,
        lines: [{ amount: 10000, choreographyInscriptionId: inscription.id }],
      }),
    );

    // Nothing left to resolve before removing it: the comprobante is a reason
    // to withdraw, not a blocker, and the dialog says so before the click.
    await expect(loadDeleteBlockers(invoiced.id)).resolves.toEqual([]);
    await expect(loadRemovalOutcome(invoiced.id)).resolves.toBe("withdrawn");

    const response = await submitDetailAction({
      body: deleteFormData(),
      choreographyId: invoiced.id,
      email: "admin.coreografias.retiro.comprobantes@example.com",
      role: "admin",
    });

    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) {
      throw new Error("Expected redirect response.");
    }
    await expectFlashRedirect(response, "/administracion/coreografias", {
      id: "route-notification:choreography-withdrawn",
      message: "Coreografía retirada. Su dinero sigue asignado.",
      variant: "success",
    });

    const withdrawn = await db.query.choreographies.findFirst({
      where: eq(choreographies.id, invoiced.id),
    });
    expect(withdrawn?.withdrawnAt).toBeInstanceOf(Date);
    // The withdrawal is a write like any other, so it stamps `updatedAt` too.
    expect(withdrawn?.updatedAt).toEqual(withdrawn?.withdrawnAt);
    // The number is kept: a withdrawn choreography is still found by it.
    expect(withdrawn?.choreographyNumber).toBe(invoiced.choreographyNumber);
    await expect(
      db.query.choreographyDancers.findFirst({
        columns: { withdrawnAt: true },
        where: eq(choreographyDancers.id, inscription.id),
      }),
    ).resolves.toEqual({ withdrawnAt: withdrawn?.withdrawnAt });
  });

  // The presentation is removed on a withdrawal too: a choreography that will
  // not be performed must not stay programmed. Its number stays a gap, exactly
  // as on a delete.
  test("removes the unevaluated presentation of a withdrawn choreography and leaves its number as a gap", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Retirada Numerada",
      email: "admin.coreografias.retirada.numerada.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const withdrawing = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Retirada numerada",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const neighbour = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Vecina numerada",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await createSelectedPriceInscriptionForTest({
      academyId: owner.academyId,
      allocatedAmount: 4000,
      choreographyId: withdrawing.id,
      eventId: event.id,
    });
    await db.insert(presentations).values([
      { choreographyId: withdrawing.id, eventId: event.id, orderNumber: 3 },
      { choreographyId: neighbour.id, eventId: event.id, orderNumber: 4 },
    ]);

    // An unevaluated presentation refuses nothing.
    await expect(loadDeleteBlockers(withdrawing.id)).resolves.toEqual([]);
    await expect(loadRemovalOutcome(withdrawing.id)).resolves.toBe("withdrawn");

    await submitDetailAction({
      body: deleteFormData(),
      choreographyId: withdrawing.id,
      email: "admin.coreografias.retirada.numerada@example.com",
      role: "admin",
    });

    const withdrawn = await db.query.choreographies.findFirst({
      where: eq(choreographies.id, withdrawing.id),
    });
    expect(withdrawn?.withdrawnAt).toBeInstanceOf(Date);
    await expect(
      db.query.presentations.findMany({
        where: eq(presentations.eventId, event.id),
      }),
    ).resolves.toMatchObject([
      { choreographyId: neighbour.id, orderNumber: 4 },
    ]);
  });

  // The one refusal left, and it refuses both outcomes: with money on the
  // choreography the action would have withdrawn it, and it is refused all the
  // same.
  test("refuses to delete or withdraw a choreography whose presentation was evaluated", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Evaluada",
      email: "admin.coreografias.evaluada.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const empty = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Evaluada sin dinero",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const funded = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Evaluada con dinero",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await createSelectedPriceInscriptionForTest({
      academyId: owner.academyId,
      allocatedAmount: 6000,
      choreographyId: funded.id,
      eventId: event.id,
    });
    await db.insert(presentations).values({
      choreographyId: empty.id,
      eventId: event.id,
      orderNumber: 7,
    });
    evaluatedChoreographyIds.add(empty.id);
    evaluatedChoreographyIds.add(funded.id);

    await expect(loadDeleteBlockers(empty.id)).resolves.toEqual([
      "evaluated-presentation",
    ]);

    await expectThrownResponse(
      submitDetailAction({
        body: deleteFormData(),
        choreographyId: empty.id,
        email: "admin.coreografias.evaluada.vacia@example.com",
        role: "admin",
      }),
      409,
    );
    await expectThrownResponse(
      submitDetailAction({
        body: deleteFormData(),
        choreographyId: funded.id,
        email: "admin.coreografias.evaluada.dinero@example.com",
        role: "admin",
      }),
      409,
    );

    // Neither outcome happened: both rows are there, neither is withdrawn, and
    // the evaluated presentation keeps its place in the order.
    const rows = await db.query.choreographies.findMany({
      where: eq(choreographies.eventId, event.id),
    });
    expect(
      rows.map((row) => ({ id: row.id, withdrawnAt: row.withdrawnAt })).sort(),
    ).toEqual(
      [
        { id: empty.id, withdrawnAt: null },
        { id: funded.id, withdrawnAt: null },
      ].sort(),
    );
    await expect(
      db.query.presentations.findMany({
        where: eq(presentations.eventId, event.id),
      }),
    ).resolves.toMatchObject([{ choreographyId: empty.id, orderNumber: 7 }]);
  });

  test("withdraws a choreography holding money, keeps every allocation and leaves the available balance untouched", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Con Dinero",
      email: "admin.coreografias.dinero.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const funded = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Con seña",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    // One inscription holds the deposit; the other holds nothing and is
    // withdrawn all the same, with the very same timestamp.
    const paid = await createSelectedPriceInscriptionForTest({
      academyId: owner.academyId,
      allocatedAmount: 5000,
      choreographyId: funded.id,
      eventId: event.id,
    });
    const unpaid = await createSelectedPriceInscriptionForTest({
      academyId: owner.academyId,
      choreographyId: funded.id,
    });
    // A dancer taken off the roster beforehand: their own earlier stamp is not
    // overwritten, so restoring can tell the two removals apart.
    const removedEarlier = await createSelectedPriceInscriptionForTest({
      academyId: owner.academyId,
      allocatedAmount: 1000,
      choreographyId: funded.id,
      eventId: event.id,
    });
    const earlierWithdrawal = date("2026-03-01T10:00:00.000Z");
    await db
      .update(choreographyDancers)
      .set({ withdrawnAt: earlierWithdrawal })
      .where(eq(choreographyDancers.id, removedEarlier.id));

    const balanceBefore = await readAcademyAvailableBalance(db, {
      academyId: owner.academyId,
      eventId: event.id,
    });

    await submitDetailAction({
      body: deleteFormData(),
      choreographyId: funded.id,
      email: "admin.coreografias.retiro.dinero@example.com",
      role: "admin",
    });

    const withdrawn = await db.query.choreographies.findFirst({
      where: eq(choreographies.id, funded.id),
    });
    expect(withdrawn?.withdrawnAt).toBeInstanceOf(Date);

    const inscriptions = await db.query.choreographyDancers.findMany({
      where: eq(choreographyDancers.choreographyId, funded.id),
    });
    expect(
      inscriptions
        .filter((inscription) => inscription.id !== removedEarlier.id)
        .map((inscription) => inscription.withdrawnAt?.toISOString()),
    ).toEqual([
      withdrawn?.withdrawnAt?.toISOString(),
      withdrawn?.withdrawnAt?.toISOString(),
    ]);
    expect(
      inscriptions.find((inscription) => inscription.id === removedEarlier.id)
        ?.withdrawnAt,
    ).toEqual(earlierWithdrawal);
    expect(inscriptions.map((inscription) => inscription.id).sort()).toEqual(
      [paid.id, unpaid.id, removedEarlier.id].sort(),
    );

    // No money moved: the allocations stay on their inscriptions instead of
    // flowing back into `Saldo disponible`.
    const allocations = await db.query.paymentAllocations.findMany();
    expect(
      allocations
        .map((allocation) => allocation.choreographyInscriptionId)
        .sort(),
    ).toEqual([paid.id, removedEarlier.id].sort());
    await expect(
      readAcademyAvailableBalance(db, {
        academyId: owner.academyId,
        eventId: event.id,
      }),
    ).resolves.toBe(balanceBefore);
  });

  // The dialog was rendered while the choreography was still empty; the money
  // arrives before the click. The outcome is decided inside the write's
  // transaction, so the allocation is preserved rather than cascaded away.
  test("withdraws when money is allocated between the dialog and the confirmation", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Carrera",
      email: "admin.coreografias.carrera.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Carrera",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });

    await expect(loadDeleteBlockers(choreography.id)).resolves.toEqual([]);

    const inscription = await createSelectedPriceInscriptionForTest({
      academyId: owner.academyId,
      allocatedAmount: 3000,
      choreographyId: choreography.id,
      eventId: event.id,
    });

    await submitDetailAction({
      body: deleteFormData(),
      choreographyId: choreography.id,
      email: "admin.coreografias.carrera@example.com",
      role: "admin",
    });

    await expect(
      db.query.choreographies.findFirst({
        columns: { id: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toEqual({ id: choreography.id });
    await expect(
      db.query.paymentAllocations.findMany({
        columns: { amount: true, choreographyInscriptionId: true },
      }),
    ).resolves.toEqual([
      { amount: 3000, choreographyInscriptionId: inscription.id },
    ]);
  });
});

/**
 * What the dialog would announce for this choreography: the loader reads the
 * outcome so the admin knows before confirming whether it goes or survives as
 * a withdrawn one.
 */
async function loadRemovalOutcome(choreographyId: string) {
  const data = await loadDetail({
    choreographyId,
    email: `admin.coreografias.desenlace.${choreographyId}@example.com`,
    role: "admin",
  });

  return data.deletion.outcome;
}

async function loadDeleteBlockers(choreographyId: string) {
  const data = await loadDetail({
    choreographyId,
    email: `admin.coreografias.bloqueos.${choreographyId}@example.com`,
    role: "admin",
  });

  return data.deletion.blockers.map((blocker) => blocker.code);
}

// Snapshot of a `Factura C` to an anonymous final consumer from the exempt issuer;
// the overrides allow deriving the mirror NC (cbteTipo 13 +
// associatedComprobanteId).
function facturaCInput(
  overrides: Partial<RecordComprobanteInput> & {
    choreographyId: string;
    eventId: string;
  },
): RecordComprobanteInput {
  const { choreographyId, ...rest } = overrides;

  return {
    anchor: choreographyAnchor(choreographyId),
    cbteTipo: 11,
    ptoVta: 1,
    cbteNro: 1,
    cbteFch: "20260722",
    impTotal: 10000,
    issuerCuit: "30717611590",
    issuerIvaCondition: "exento",
    receptorDocTipo: 99,
    receptorDocNro: "0",
    receptorIvaConditionId: 5,
    cae: "75123456789012",
    caeVto: "20260801",
    lines: [],
    ...rest,
  };
}
