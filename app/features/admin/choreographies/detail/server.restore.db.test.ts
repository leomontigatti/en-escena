import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  choreographies,
  choreographyDancers,
  modalities,
  scheduleCapacities,
  scheduleCategories,
  scheduleModalities,
  schedules,
} from "@/db/schema";
import { toSavedChoreographyDraft } from "@/features/admin/choreographies/detail/draft-form";
import {
  resolveChoreographyDraftIntent,
  saveChoreographyDraftIntent,
  toChoreographyDraftFormData,
  type ChoreographyDraft,
} from "@/features/admin/choreographies/detail/draft.shared";
import {
  createAcademySession,
  createChoreographyRecord,
  createEventCatalog,
  createEventRecord,
  date,
  createSelectedPriceInscriptionForTest,
} from "@/features/portal/choreographies/test-support/db";
import { resolveOccupiedCounts } from "@/lib/choreographies/schedule-capacity-occupancy.server";
import { createScheduleForModalityFixture } from "@/lib/choreographies/registration.test-support";
import { evaluatedChoreographyIds } from "@/lib/presentations/evaluation-lock.test-support";
import { expectThrownResponse } from "@/lib/test-support/http";
import {
  loadDetail,
  submitDetailAction,
  deleteFormData,
  restoreFormData,
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

describe("administrative choreography detail: restoring a withdrawn choreography", () => {
  // Restoring is the withdrawal undone, not a re-registration: it revives
  // exactly the inscriptions that withdrawal took —the ones carrying its very
  // timestamp— and leaves the ones that were already off the roster alone.
  test("restores a withdrawn choreography and revives only the inscriptions its withdrawal took", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Restaurada",
      email: "admin.coreografias.restaurada.academia@example.com",
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
      name: "Restaurable",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const funded = await createSelectedPriceInscriptionForTest({
      academyId: owner.academyId,
      allocatedAmount: 4000,
      choreographyId: choreography.id,
      eventId: event.id,
    });
    const removedEarlier = await createSelectedPriceInscriptionForTest({
      academyId: owner.academyId,
      allocatedAmount: 1000,
      choreographyId: choreography.id,
      eventId: event.id,
    });
    // A dancer taken off the roster before the choreography was withdrawn: the
    // stamp is their own, so the restore must not read them as part of it.
    const earlierWithdrawal = date("2026-04-01T12:00:00Z");
    await db
      .update(choreographyDancers)
      .set({ withdrawnAt: earlierWithdrawal })
      .where(eq(choreographyDancers.id, removedEarlier.id));

    await submitDetailAction({
      body: deleteFormData(),
      choreographyId: choreography.id,
      email: "admin.coreografias.restaurada.retiro@example.com",
      role: "admin",
    });
    // A stale age, so the refresh reviving performs is observable: a revived
    // inscription is on the roster again and may not carry an age its placement
    // disagrees with.
    await db
      .update(choreographyDancers)
      .set({ ageAtEventStart: 99 })
      .where(eq(choreographyDancers.id, funded.id));

    await expect(
      loadDetail({
        choreographyId: choreography.id,
        email: "admin.coreografias.restaurada.previo@example.com",
        role: "admin",
      }).then((data) => data.restoration.canRestore),
    ).resolves.toBe(true);

    await expect(
      submitDetailAction({
        body: restoreFormData(),
        choreographyId: choreography.id,
        email: "admin.coreografias.restaurada.accion@example.com",
        role: "admin",
      }),
    ).resolves.toEqual({
      message: "Coreografía restaurada.",
      status: "success",
    });

    await expect(
      db.query.choreographies.findFirst({
        columns: { withdrawnAt: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toEqual({ withdrawnAt: null });
    await expect(
      db.query.choreographyDancers.findFirst({
        columns: { ageAtEventStart: true, withdrawnAt: true },
        where: eq(choreographyDancers.id, funded.id),
      }),
    ).resolves.toEqual({ ageAtEventStart: 14, withdrawnAt: null });
    await expect(
      db.query.choreographyDancers.findFirst({
        columns: { withdrawnAt: true },
        where: eq(choreographyDancers.id, removedEarlier.id),
      }),
    ).resolves.toEqual({ withdrawnAt: earlierWithdrawal });

    // Its place is taken again: while withdrawn it counted nowhere.
    const occupiedCount = await resolveOccupiedCounts([
      {
        scheduleCapacityId: catalog.scheduleCapacity.id,
        scheduleId: catalog.schedule.id,
      },
    ]);
    expect(
      occupiedCount({
        scheduleCapacityId: catalog.scheduleCapacity.id,
        scheduleId: catalog.schedule.id,
      }),
    ).toBe(1);
  });

  // The place a withdrawal frees is a place another choreography may take, so
  // the restore asks for it again under the assignment lock and is refused when
  // it is gone. Restoring never overshoots a capacity.
  test("refuses to restore when the schedule capacity filled up while the choreography was withdrawn", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Restaurada Sin Cupo",
      email: "admin.coreografias.restaurada.sincupo.academia@example.com",
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
      name: "Sin cupo al volver",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const inscription = await createSelectedPriceInscriptionForTest({
      academyId: owner.academyId,
      allocatedAmount: 4000,
      choreographyId: choreography.id,
      eventId: event.id,
    });

    await submitDetailAction({
      body: deleteFormData(),
      choreographyId: choreography.id,
      email: "admin.coreografias.restaurada.sincupo.retiro@example.com",
      role: "admin",
    });

    // The fixture capacity holds five: five newcomers took the place the
    // withdrawal freed.
    for (const index of [1, 2, 3, 4, 5]) {
      await createChoreographyRecord({
        academyId: owner.academyId,
        categoryId: catalog.categoryWithLevel.id,
        eventId: event.id,
        experienceLevelId: catalog.level.id,
        modalityId: catalog.modality.id,
        name: `Ocupante ${index}`,
        scheduleCapacityId: catalog.scheduleCapacity.id,
        submodalityId: catalog.submodality.id,
      });
    }

    await expect(
      submitDetailAction({
        body: restoreFormData(),
        choreographyId: choreography.id,
        email: "admin.coreografias.restaurada.sincupo.accion@example.com",
        role: "admin",
      }),
    ).resolves.toEqual({
      message:
        "No se puede restaurar: el cupo de cronograma que ocupaba no tiene lugar disponible. Liberá un lugar o ampliá el cupo en las bases del evento.",
      status: "error",
    });

    // Refused means nothing moved: still withdrawn, and so is its inscription.
    await expect(
      db.query.choreographies.findFirst({
        columns: { withdrawnAt: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toMatchObject({ withdrawnAt: expect.any(Date) });
    await expect(
      db.query.choreographyDancers.findFirst({
        columns: { withdrawnAt: true },
        where: eq(choreographyDancers.id, inscription.id),
      }),
    ).resolves.toMatchObject({ withdrawnAt: expect.any(Date) });
  });

  // A withdrawn choreography does not block deleting the capacity it points at,
  // so that delete releases the reference. The restore does not give up over
  // it: it resolves the place again on the very same schedule, the way
  // registration resolves one, and lands on the schedule total when the
  // schedule declares no capacity for the group type.
  test("restores onto the schedule total when the capacity it pointed at was deleted", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Restaurada Sin Destino",
      email: "admin.coreografias.restaurada.sindestino.academia@example.com",
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
      name: "Sin destino",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const inscription = await createSelectedPriceInscriptionForTest({
      academyId: owner.academyId,
      allocatedAmount: 4000,
      choreographyId: choreography.id,
      eventId: event.id,
    });

    await submitDetailAction({
      body: deleteFormData(),
      choreographyId: choreography.id,
      email: "admin.coreografias.restaurada.sindestino.retiro@example.com",
      role: "admin",
    });

    // What deleting the capacity leaves behind: the reference released, the
    // choreography still withdrawn.
    await db
      .update(choreographies)
      .set({ scheduleCapacityId: null })
      .where(eq(choreographies.id, choreography.id));
    await db
      .delete(scheduleCapacities)
      .where(eq(scheduleCapacities.id, catalog.scheduleCapacity.id));

    await expect(
      submitDetailAction({
        body: restoreFormData(),
        choreographyId: choreography.id,
        email: "admin.coreografias.restaurada.sindestino.accion@example.com",
        role: "admin",
      }),
    ).resolves.toEqual({
      message: "Coreografía restaurada.",
      status: "success",
    });
    await expect(
      db.query.choreographies.findFirst({
        columns: { scheduleCapacityId: true, withdrawnAt: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toEqual({ scheduleCapacityId: null, withdrawnAt: null });
    await expect(
      db.query.choreographyDancers.findFirst({
        columns: { withdrawnAt: true },
        where: eq(choreographyDancers.id, inscription.id),
      }),
    ).resolves.toEqual({ withdrawnAt: null });

    // It counts against the schedule total now, which is the place it took.
    const occupiedCount = await resolveOccupiedCounts([
      { scheduleCapacityId: null, scheduleId: catalog.schedule.id },
    ]);
    expect(
      occupiedCount({
        scheduleCapacityId: null,
        scheduleId: catalog.schedule.id,
      }),
    ).toBe(1);
  });

  // The bases may have gained a capacity for the group type while the
  // choreography was away. Resolving the place again is what finds it: the
  // restore writes the reference the deleted capacity left empty.
  test("restores onto a capacity for its group type created after the delete", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Restaurada Cupo Nuevo",
      email: "admin.coreografias.restaurada.cuponuevo.academia@example.com",
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
      name: "Cupo nuevo",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await createSelectedPriceInscriptionForTest({
      academyId: owner.academyId,
      allocatedAmount: 4000,
      choreographyId: choreography.id,
      eventId: event.id,
    });

    await submitDetailAction({
      body: deleteFormData(),
      choreographyId: choreography.id,
      email: "admin.coreografias.restaurada.cuponuevo.retiro@example.com",
      role: "admin",
    });

    await db
      .update(choreographies)
      .set({ scheduleCapacityId: null })
      .where(eq(choreographies.id, choreography.id));
    await db
      .delete(scheduleCapacities)
      .where(eq(scheduleCapacities.id, catalog.scheduleCapacity.id));
    const [rebuiltScheduleCapacity] = await db
      .insert(scheduleCapacities)
      .values({
        scheduleId: catalog.schedule.id,
        groupType: "solo",
        capacity: 3,
      })
      .returning();

    await expect(
      submitDetailAction({
        body: restoreFormData(),
        choreographyId: choreography.id,
        email: "admin.coreografias.restaurada.cuponuevo.accion@example.com",
        role: "admin",
      }),
    ).resolves.toEqual({
      message: "Coreografía restaurada.",
      status: "success",
    });
    await expect(
      db.query.choreographies.findFirst({
        columns: { scheduleCapacityId: true, withdrawnAt: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toEqual({
      scheduleCapacityId: rebuiltScheduleCapacity.id,
      withdrawnAt: null,
    });
  });

  // A choreography that never had a capacity of its own: its schedule declares
  // none for its group type, so the schedule total is its allowance, and that
  // is the place the restore measures and takes.
  test("restores a choreography holding no specific capacity against the schedule total", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Restaurada Cupo Global",
      email: "admin.coreografias.restaurada.global.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    // A second schedule of the same modality, with no capacity of any group
    // type: the choreography on it uses the total as a global allowance.
    const globalSchedule = await createScheduleForModalityFixture({
      eventId: event.id,
      modalityId: catalog.modality.id,
    });
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Cupo global",
      scheduleCapacityId: null,
      scheduleId: globalSchedule.id,
      submodalityId: catalog.submodality.id,
    });
    await createSelectedPriceInscriptionForTest({
      academyId: owner.academyId,
      allocatedAmount: 4000,
      choreographyId: choreography.id,
      eventId: event.id,
    });

    await submitDetailAction({
      body: deleteFormData(),
      choreographyId: choreography.id,
      email: "admin.coreografias.restaurada.global.retiro@example.com",
      role: "admin",
    });

    await expect(
      submitDetailAction({
        body: restoreFormData(),
        choreographyId: choreography.id,
        email: "admin.coreografias.restaurada.global.accion@example.com",
        role: "admin",
      }),
    ).resolves.toEqual({
      message: "Coreografía restaurada.",
      status: "success",
    });
    await expect(
      db.query.choreographies.findFirst({
        columns: {
          scheduleCapacityId: true,
          scheduleId: true,
          withdrawnAt: true,
        },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toEqual({
      scheduleCapacityId: null,
      // Never moved to another schedule.
      scheduleId: globalSchedule.id,
      withdrawnAt: null,
    });

    const occupiedCount = await resolveOccupiedCounts([
      { scheduleCapacityId: null, scheduleId: globalSchedule.id },
    ]);
    expect(
      occupiedCount({
        scheduleCapacityId: null,
        scheduleId: globalSchedule.id,
      }),
    ).toBe(1);
  });

  // The other half of the refusal: no capacity was selected here either, so the
  // message names the schedule and the lever that opens it.
  test("refuses to restore when the schedule total filled up while the choreography was withdrawn", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Restaurada Cronograma Lleno",
      email:
        "admin.coreografias.restaurada.cronogramalleno.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const globalSchedule = await createScheduleForModalityFixture({
      eventId: event.id,
      modalityId: catalog.modality.id,
    });
    await db
      .update(schedules)
      .set({ totalCapacity: 1 })
      .where(eq(schedules.id, globalSchedule.id));
    const choreography = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Cupo global lleno",
      scheduleCapacityId: null,
      scheduleId: globalSchedule.id,
      submodalityId: catalog.submodality.id,
    });
    await createSelectedPriceInscriptionForTest({
      academyId: owner.academyId,
      allocatedAmount: 4000,
      choreographyId: choreography.id,
      eventId: event.id,
    });

    await submitDetailAction({
      body: deleteFormData(),
      choreographyId: choreography.id,
      email: "admin.coreografias.restaurada.cronogramalleno.retiro@example.com",
      role: "admin",
    });

    // The one place the schedule holds was taken while it was away.
    await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Ocupante del total",
      scheduleCapacityId: null,
      scheduleId: globalSchedule.id,
      submodalityId: catalog.submodality.id,
    });

    await expect(
      submitDetailAction({
        body: restoreFormData(),
        choreographyId: choreography.id,
        email:
          "admin.coreografias.restaurada.cronogramalleno.accion@example.com",
        role: "admin",
      }),
    ).resolves.toEqual({
      message:
        "No se puede restaurar: el cronograma no tiene lugar disponible. Liberá un lugar o ampliá el cupo total en las bases del evento.",
      status: "error",
    });
    await expect(
      db.query.choreographies.findFirst({
        columns: { withdrawnAt: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toMatchObject({ withdrawnAt: expect.any(Date) });
  });

  // A withdrawn choreography holds no place, so it does not stop the schedule
  // from dropping its modality or its category. The restore is where that
  // shows: it is refused rather than bringing the choreography back onto a
  // schedule that no longer accepts it.
  test("refuses to restore when the schedule no longer accepts its modality or category", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Restaurada Incompatible",
      email: "admin.coreografias.restaurada.incompatible.academia@example.com",
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
      name: "Fuera del cronograma",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await createSelectedPriceInscriptionForTest({
      academyId: owner.academyId,
      allocatedAmount: 4000,
      choreographyId: choreography.id,
      eventId: event.id,
    });

    await submitDetailAction({
      body: deleteFormData(),
      choreographyId: choreography.id,
      email: "admin.coreografias.restaurada.incompatible.retiro@example.com",
      role: "admin",
    });

    const [tango] = await db
      .insert(modalities)
      .values({ eventId: event.id, name: `Tango ${event.id}` })
      .returning();
    await db
      .insert(scheduleModalities)
      .values({ modalityId: tango.id, scheduleId: catalog.schedule.id });
    await db
      .delete(scheduleModalities)
      .where(eq(scheduleModalities.modalityId, catalog.modality.id));

    const restore = (attempt: number) =>
      submitDetailAction({
        body: restoreFormData(),
        choreographyId: choreography.id,
        email: `admin.coreografias.restaurada.incompatible.accion${attempt}@example.com`,
        role: "admin",
      });

    await expect(restore(1)).resolves.toEqual({
      message:
        "No se puede restaurar: el cronograma ya no acepta su modalidad. Volvé a agregarla al cronograma en las bases del evento.",
      status: "error",
    });

    await db.insert(scheduleModalities).values({
      modalityId: catalog.modality.id,
      scheduleId: catalog.schedule.id,
    });
    await db.insert(scheduleCategories).values({
      categoryId: catalog.categoryWithoutLevel.id,
      scheduleId: catalog.schedule.id,
    });

    await expect(restore(2)).resolves.toEqual({
      message:
        "No se puede restaurar: el cronograma ya no acepta su categoría. Volvé a agregarla al cronograma en las bases del evento.",
      status: "error",
    });
    await expect(
      db.query.choreographies.findFirst({
        columns: { withdrawnAt: true },
        where: eq(choreographies.id, choreography.id),
      }),
    ).resolves.toMatchObject({ withdrawnAt: expect.any(Date) });

    await db.insert(scheduleCategories).values({
      categoryId: catalog.categoryWithLevel.id,
      scheduleId: catalog.schedule.id,
    });

    await expect(restore(3)).resolves.toMatchObject({ status: "success" });
  });

  // Restoring is an administrative correction on a withdrawn choreography, and
  // on nothing else: the auditor sees the state without undoing it, and a
  // choreography that is taking part has nothing to restore.
  test("offers restoring only to administrators and only on a withdrawn choreography", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Restaurada Permisos",
      email: "admin.coreografias.restaurada.permisos.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const taking = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Participante",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const withdrawn = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Retirada",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    await createSelectedPriceInscriptionForTest({
      academyId: owner.academyId,
      allocatedAmount: 4000,
      choreographyId: withdrawn.id,
      eventId: event.id,
    });

    await submitDetailAction({
      body: deleteFormData(),
      choreographyId: withdrawn.id,
      email: "admin.coreografias.restaurada.permisos.retiro@example.com",
      role: "admin",
    });

    await expect(
      loadDetail({
        choreographyId: taking.id,
        email:
          "admin.coreografias.restaurada.permisos.participante@example.com",
        role: "admin",
      }).then((data) => data.restoration.canRestore),
    ).resolves.toBe(false);
    await expect(
      loadDetail({
        choreographyId: withdrawn.id,
        email: "auditor.coreografias.restaurada.permisos@example.com",
        role: "auditor",
      }).then((data) => data.restoration.canRestore),
    ).resolves.toBe(false);

    await expectThrownResponse(
      submitDetailAction({
        body: restoreFormData(),
        choreographyId: withdrawn.id,
        email: "auditor.coreografias.restaurada.permisos.accion@example.com",
        role: "auditor",
      }),
      403,
    );
    await expect(
      db.query.choreographies.findFirst({
        columns: { withdrawnAt: true },
        where: eq(choreographies.id, withdrawn.id),
      }),
    ).resolves.toMatchObject({ withdrawnAt: expect.any(Date) });

    await expect(
      submitDetailAction({
        body: restoreFormData(),
        choreographyId: taking.id,
        email: "admin.coreografias.restaurada.permisos.nada@example.com",
        role: "admin",
      }),
    ).resolves.toEqual({
      message:
        "Esta coreografía no está retirada, así que no hay nada que restaurar.",
      status: "error",
    });
  });

  // A withdrawn choreography is not taking part, so nothing about it is edited
  // while the stamp is there. The hidden controls are not the rule: every write
  // is refused on the server, and only restoring gets through.
  test("refuses every write but the restore while the choreography is withdrawn", async () => {
    const owner = await createAcademySession({
      academyName: "Academia Solo Lectura",
      email: "admin.coreografias.retirada.solo-lectura.academia@example.com",
    });
    const event = await createEventRecord({
      active: true,
      name: "Regional 2026",
    });
    const catalog = await createEventCatalog(event.id);
    const withdrawn = await createChoreographyRecord({
      academyId: owner.academyId,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: "Retirada",
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
    });
    const funded = await createSelectedPriceInscriptionForTest({
      academyId: owner.academyId,
      allocatedAmount: 4000,
      choreographyId: withdrawn.id,
      eventId: event.id,
    });

    await submitDetailAction({
      body: deleteFormData(),
      choreographyId: withdrawn.id,
      email: "admin.coreografias.retirada.solo-lectura.retiro@example.com",
      role: "admin",
    });

    const detail = await loadDetail({
      choreographyId: withdrawn.id,
      email: "admin.coreografias.retirada.solo-lectura.detalle@example.com",
      role: "admin",
    });
    // Every field of the form goes read-only with `canEdit`.
    expect(detail.canEdit).toBe(false);
    // The one action left, and it is an administrator's: the page is read-only
    // around it, not closed.
    expect(detail.restoration.canRestore).toBe(true);

    const saved = toSavedChoreographyDraft(detail.choreography);
    const draftBody = (
      draft: ChoreographyDraft,
      intent:
        | typeof resolveChoreographyDraftIntent
        | typeof saveChoreographyDraftIntent,
    ) => toChoreographyDraftFormData({ draft, intent });
    const refusedWrites: Array<[string, FormData]> = [
      ["preview", draftBody(saved, resolveChoreographyDraftIntent)],
      [
        "rename",
        draftBody(
          { ...saved, name: "Nombre nuevo" },
          saveChoreographyDraftIntent,
        ),
      ],
      [
        "roster",
        draftBody(
          { ...saved, dancerIds: [funded.dancerId] },
          saveChoreographyDraftIntent,
        ),
      ],
      // A withdrawn choreography is never removed again: there is no second
      // outcome left for it.
      ["delete", deleteFormData()],
    ];

    for (const [label, body] of refusedWrites) {
      await expectThrownResponse(
        submitDetailAction({
          body,
          choreographyId: withdrawn.id,
          email: `admin.coreografias.retirada.solo-lectura.${label}@example.com`,
          role: "admin",
        }),
        403,
      );
    }

    // Nothing moved: not the name the rename aimed at, not the roster, and not
    // the withdrawal itself.
    await expect(
      db.query.choreographies.findFirst({
        columns: { name: true },
        where: eq(choreographies.id, withdrawn.id),
      }),
    ).resolves.toEqual({ name: "Retirada" });
    await expect(
      db.query.choreographyDancers.findFirst({
        columns: { withdrawnAt: true },
        where: eq(choreographyDancers.id, funded.id),
      }),
    ).resolves.toMatchObject({ withdrawnAt: expect.any(Date) });
  });
});
