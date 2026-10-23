import { insertTestPrices } from "@/lib/prices/price-rows.test-support";
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
import {
  createAcademySession,
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  createEventRecord,
  date,
  createSelectedPriceInscriptionForTest,
} from "@/features/portal/choreographies/test-support/db";
import { createScheduleForModalityFixture } from "@/lib/choreographies/registration.test-support";
import { evaluatedChoreographyMessage } from "@/lib/choreographies/choreography-locks";
import { compatibleScheduleSelectionRequiredMessage } from "@/lib/choreographies/choreography-roster.shared";
import { priceDivergenceScheduleCapacityMessage } from "@/lib/choreographies/schedule-capacity-lock.server";
import { evaluatedChoreographyIds } from "@/lib/presentations/evaluation-lock.test-support";
import { expectThrownResponse } from "@/lib/test-support/http";
import {
  loadDetail,
  saveDraftEdits,
  submitDraftAsAuditor,
  canPickScheduleCapacity,
} from "@/features/admin/choreographies/detail/server.test-support";

import {
  installDatabaseTestHooks,
  isPgliteTestBackend,
} from "../../../../../tests/db/harness";
import {
  readBackendPid,
  waitForABackendBlockedBy,
} from "../../../../../tests/db/lock-contention";

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

describe("administrative choreography detail: schedule capacity", () => {
  test("reassigns the schedule capacity to another compatible schedule", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma",
      slug: "cronograma",
    });
    const staleUpdatedAt = date("2026-01-01T12:00:00Z");
    await db
      .update(choreographies)
      .set({ updatedAt: staleUpdatedAt })
      .where(eq(choreographies.id, scenario.choreography.id));

    const result = await scenario.reassignTo(
      scenario.target.scheduleCapacity.id,
    );

    expect(result).not.toBeInstanceOf(Response);
    expect(result).toMatchObject({
      message: "Coreografía guardada.",
      status: "success",
    });

    const stored = await db.query.choreographies.findFirst({
      columns: {
        scheduleCapacityId: true,
        scheduleId: true,
        updatedAt: true,
      },
      where: eq(choreographies.id, scenario.choreography.id),
    });
    expect(stored?.scheduleCapacityId).toBe(
      scenario.target.scheduleCapacity.id,
    );
    expect(stored?.scheduleId).toBe(scenario.target.schedule.id);
    expect(stored?.updatedAt.getTime()).toBeGreaterThan(
      staleUpdatedAt.getTime(),
    );
  });

  test("rejects a schedule capacity that is not compatible, whatever the form sent", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Incompatible",
      slug: "cronograma.incompatible",
    });
    const foreignModality = await createModalityRecord({
      eventId: scenario.event.id,
      name: "Urbano",
    });
    const foreign = await createScheduleWithSoloCapacity({
      eventId: scenario.event.id,
      modalityId: foreignModality.id,
    });

    const result = await scenario.reassignTo(foreign.scheduleCapacity.id);

    expect(result).toMatchObject({ status: "error" });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      scheduleId: scenario.catalog.schedule.id,
    });
  });

  test("blocks the reassignment when the choreography was evaluated", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Evaluada",
      isEvaluated: true,
      slug: "cronograma.evaluada",
    });

    const result = await scenario.reassignTo(
      scenario.target.scheduleCapacity.id,
    );

    expect(result).toEqual({
      message: evaluatedChoreographyMessage,
      status: "error",
    });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      scheduleId: scenario.catalog.schedule.id,
    });
  });

  // A specific capacity with room is not enough: the total capacity of the
  // schedule containing it is a second barrier, and the reassignment has to hit
  // it just as registration does.
  test("rejects a target capacity with room when its schedule is already full", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Total Lleno",
      slug: "cronograma.total.lleno",
    });
    await createChoreographyRecord({
      academyId: scenario.owner.academyId,
      categoryId: scenario.catalog.categoryWithLevel.id,
      eventId: scenario.event.id,
      experienceLevelId: scenario.catalog.level.id,
      modalityId: scenario.catalog.modality.id,
      name: "Ocupante",
      scheduleCapacityId: scenario.target.scheduleCapacity.id,
      submodalityId: scenario.catalog.submodality.id,
    });
    await db
      .update(schedules)
      .set({ totalCapacity: 1 })
      .where(eq(schedules.id, scenario.target.schedule.id));

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.total.lleno.detalle@example.com",
      role: "admin",
    });
    const target = detail.draft.scheduleCapacity.options.find(
      (option) => option.id === scenario.target.scheduleCapacity.id,
    );
    // The specific capacity says 1/5 and it is still offered disabled: the view
    // cannot promise room where the intent is going to refuse.
    expect(target?.label).toContain("1/5 ocupados · sin cupo");
    expect(target?.isFull).toBe(true);

    const result = await scenario.reassignTo(
      scenario.target.scheduleCapacity.id,
    );

    expect(result).toMatchObject({
      message: "El cronograma seleccionado ya no tiene cupo disponible.",
      status: "error",
    });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      scheduleId: scenario.catalog.schedule.id,
    });
  });

  // The `Seña` may appear between the loader opening the field and the intent
  // running: the guard is revalidated inside the transaction, not before it.
  test("blocks a reassignment whose deposit was registered after the field was open", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Seña Tardía",
      slug: "cronograma.senia.tardia",
    });
    await insertSoloPrice({ amount: 10000, eventId: scenario.event.id });
    await insertSoloPrice({
      amount: 20000,
      eventId: scenario.event.id,
      scheduleId: scenario.target.schedule.id,
    });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.senia.tardia.detalle@example.com",
      role: "admin",
    });
    expect(canPickScheduleCapacity(detail)).toBe(true);

    await createSelectedPriceInscriptionForTest({
      academyId: scenario.owner.academyId,
      allocatedAmount: 1000,
      choreographyId: scenario.choreography.id,
      eventId: scenario.event.id,
    });

    const result = await scenario.reassignTo(
      scenario.target.scheduleCapacity.id,
    );

    expect(result).toMatchObject({
      message: priceDivergenceScheduleCapacityMessage,
      status: "error",
    });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      scheduleId: scenario.catalog.schedule.id,
    });
  });

  test("rejects a target schedule capacity that is already full", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Lleno",
      slug: "cronograma.lleno",
      targetCapacity: 1,
    });
    await createChoreographyRecord({
      academyId: scenario.owner.academyId,
      categoryId: scenario.catalog.categoryWithLevel.id,
      eventId: scenario.event.id,
      experienceLevelId: scenario.catalog.level.id,
      modalityId: scenario.catalog.modality.id,
      name: "Ocupante",
      scheduleCapacityId: scenario.target.scheduleCapacity.id,
      submodalityId: scenario.catalog.submodality.id,
    });

    const result = await scenario.reassignTo(
      scenario.target.scheduleCapacity.id,
    );

    expect(result).toMatchObject({
      message:
        "El cupo de cronograma seleccionado ya no tiene cupo disponible.",
      status: "error",
    });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      scheduleId: scenario.catalog.schedule.id,
    });
  });

  test("re-selecting the capacity the choreography already occupies succeeds even at capacity", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Sin Cambios",
      slug: "cronograma.sin.cambios",
    });
    // The capacity is filled by the choreography itself: without the exclusion,
    // picking the already assigned capacity would be rejected for lack of room.
    await db
      .update(scheduleCapacities)
      .set({ capacity: 1 })
      .where(eq(scheduleCapacities.id, scenario.catalog.scheduleCapacity.id));

    const result = await scenario.reassignTo(
      scenario.catalog.scheduleCapacity.id,
    );

    expect(result).toMatchObject({ status: "success" });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      scheduleId: scenario.catalog.schedule.id,
    });
  });

  /**
   * The reassignment locks the destination capacity with
   * `lockScheduleCapacityForAssignment` before it counts its occupants, so two
   * reassignments aiming at the same free slot are serialised: one wins it and
   * the other is refused.
   *
   * The fast suite runs both through a single PGlite connection, which
   * serialises the transactions on its own — the lock is never contended, and
   * the assertion would hold even without it. So this proves the lock on the
   * Postgres backend only.
   */
  describe.skipIf(isPgliteTestBackend())(
    "schedule capacity reassignment under real contention",
    () => {
      test("lets a single choreography into a capacity with one slot when two are reassigned at once", async () => {
        const scenario = await createScheduleCapacityScenario({
          academyName: "Academia Cronograma Concurrente",
          slug: "cronograma.concurrente",
          targetCapacity: 1,
        });
        const rival = await createChoreographyRecord({
          academyId: scenario.owner.academyId,
          categoryId: scenario.catalog.categoryWithLevel.id,
          eventId: scenario.event.id,
          experienceLevelId: scenario.catalog.level.id,
          modalityId: scenario.catalog.modality.id,
          name: "Rival",
          scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
          submodalityId: scenario.catalog.submodality.id,
        });

        const results = await Promise.all([
          scenario.reassignTo(scenario.target.scheduleCapacity.id),
          scenario.reassignTo(scenario.target.scheduleCapacity.id, {
            choreographyId: rival.id,
          }),
        ]);

        const statuses = results.map((result) =>
          result instanceof Response || !("status" in result)
            ? "unexpected"
            : result.status,
        );
        expect(statuses.filter((status) => status === "success")).toHaveLength(
          1,
        );
        expect(statuses.filter((status) => status === "error")).toHaveLength(1);

        const occupants = await db
          .select({ id: choreographies.id })
          .from(choreographies)
          .where(
            eq(
              choreographies.scheduleCapacityId,
              scenario.target.scheduleCapacity.id,
            ),
          );
        expect(occupants).toHaveLength(1);
      });

      // The options are resolved before the transaction, so the destination
      // is rechecked once the lock is held: an edit that stopped the schedule
      // accepting the modality while the reassignment waited must refuse it.
      test("refuses a destination whose schedule stopped accepting the modality while the reassignment waited", async () => {
        const scenario = await createScheduleCapacityScenario({
          academyName: "Academia Cronograma Editado",
          slug: "cronograma.editado",
        });
        let reassignment: ReturnType<typeof scenario.reassignTo> | undefined;

        await db.transaction(async (tx) => {
          await tx
            .select({ id: schedules.id })
            .from(schedules)
            .where(eq(schedules.id, scenario.target.schedule.id))
            .for("update");
          const holderPid = await readBackendPid(tx);

          reassignment = scenario.reassignTo(
            scenario.target.scheduleCapacity.id,
          );
          await waitForABackendBlockedBy(holderPid, "schedule lock");

          await tx
            .delete(scheduleModalities)
            .where(
              eq(scheduleModalities.scheduleId, scenario.target.schedule.id),
            );
        });

        if (!reassignment) {
          throw new Error("The reassignment never started.");
        }

        const result = await reassignment;
        expect(
          result instanceof Response || !("status" in result)
            ? "unexpected"
            : result,
        ).toMatchObject({
          message: compatibleScheduleSelectionRequiredMessage,
          status: "error",
        });
        await expect(scenario.readAssignment()).resolves.toMatchObject({
          scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
        });
      });
    },
  );

  test("keeps the assigned capacity in the options and locks the field with a single compatible one", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Opciones",
      slug: "cronograma.opciones",
    });

    const multiple = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.opciones.multiple@example.com",
      role: "admin",
    });
    expect(canPickScheduleCapacity(multiple)).toBe(true);
    expect(
      multiple.draft.scheduleCapacity.options.map((option) => option.id),
    ).toEqual(
      expect.arrayContaining([
        scenario.catalog.scheduleCapacity.id,
        scenario.target.scheduleCapacity.id,
      ]),
    );

    // With the assigned capacity outside compatibility, the current option stays
    // in the list, and the one compatible capacity next to it is a real
    // destination: reassignability is read off the options, so the drift is
    // repairable instead of locked behind a count of compatible capacities that
    // the assignment is not part of.
    const foreignModality = await createModalityRecord({
      eventId: scenario.event.id,
      name: "Urbano",
    });
    const drifted = await createScheduleWithSoloCapacity({
      eventId: scenario.event.id,
      modalityId: foreignModality.id,
    });
    await db
      .delete(schedules)
      .where(eq(schedules.id, scenario.target.schedule.id));
    await db
      .update(choreographies)
      .set({
        scheduleCapacityId: drifted.scheduleCapacity.id,
        scheduleId: drifted.schedule.id,
      })
      .where(eq(choreographies.id, scenario.choreography.id));

    const single = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.opciones.single@example.com",
      role: "admin",
    });
    expect(canPickScheduleCapacity(single)).toBe(true);
    expect(
      single.draft.scheduleCapacity.options.map((option) => option.id),
    ).toContain(drifted.scheduleCapacity.id);
  });

  test("locks the field when the drifted assignment is the only option left, and a rename keeps it", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Sin Alternativa",
      slug: "cronograma.sin.alternativa",
    });
    const foreignModality = await createModalityRecord({
      eventId: scenario.event.id,
      name: "Urbano",
    });
    const drifted = await createScheduleWithSoloCapacity({
      eventId: scenario.event.id,
      modalityId: foreignModality.id,
    });
    await db
      .update(choreographies)
      .set({
        scheduleCapacityId: drifted.scheduleCapacity.id,
        scheduleId: drifted.schedule.id,
      })
      .where(eq(choreographies.id, scenario.choreography.id));
    // Every compatible schedule is gone: the select is left with the assignment
    // alone, which is not a destination.
    await db
      .delete(schedules)
      .where(eq(schedules.id, scenario.target.schedule.id));
    await db
      .delete(schedules)
      .where(eq(schedules.id, scenario.catalog.schedule.id));

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email:
        "admin.coreografias.cronograma.sin.alternativa.detalle@example.com",
      role: "admin",
    });

    expect(
      detail.draft.scheduleCapacity.options.map((option) => option.id),
    ).toEqual([drifted.scheduleCapacity.id]);
    expect(canPickScheduleCapacity(detail)).toBe(false);

    // Keeping the drifted assignment is not a move, so a save that leaves it
    // alone goes through: it is repaired by choosing a destination, never
    // forced by an unrelated edit.
    const result = await saveDraftEdits({
      choreographyId: scenario.choreography.id,
      edits: { name: "Renombrada" },
    });

    expect(result).toMatchObject({ status: "success" });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: drifted.scheduleCapacity.id,
      scheduleId: drifted.schedule.id,
    });
  });

  test("repairs a drifted assignment onto the only compatible capacity", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Único",
      slug: "cronograma.unico",
    });

    // The assignment drifts to a capacity of another modality and a single
    // compatible schedule is left: that schedule is an alternative to where the
    // choreography sits, so the field opens and the intent accepts exactly the
    // move it offers.
    const foreignModality = await createModalityRecord({
      eventId: scenario.event.id,
      name: "Urbano",
    });
    const drifted = await createScheduleWithSoloCapacity({
      eventId: scenario.event.id,
      modalityId: foreignModality.id,
    });
    await db
      .delete(schedules)
      .where(eq(schedules.id, scenario.target.schedule.id));
    await db
      .update(choreographies)
      .set({
        scheduleCapacityId: drifted.scheduleCapacity.id,
        scheduleId: drifted.schedule.id,
      })
      .where(eq(choreographies.id, scenario.choreography.id));

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.unico.detalle@example.com",
      role: "admin",
    });
    expect(canPickScheduleCapacity(detail)).toBe(true);

    const result = await scenario.reassignTo(
      scenario.catalog.scheduleCapacity.id,
    );

    expect(result).toMatchObject({ status: "success" });
    expect(await scenario.readAssignment()).toMatchObject({
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
    });
  });

  test("shows the occupancy in the capacity options and marks the full ones", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Ocupación",
      slug: "cronograma.ocupacion",
      targetCapacity: 1,
    });
    await createChoreographyRecord({
      academyId: scenario.owner.academyId,
      categoryId: scenario.catalog.categoryWithLevel.id,
      eventId: scenario.event.id,
      experienceLevelId: scenario.catalog.level.id,
      modalityId: scenario.catalog.modality.id,
      name: "Ocupante",
      scheduleCapacityId: scenario.target.scheduleCapacity.id,
      submodalityId: scenario.catalog.submodality.id,
    });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.ocupacion.detalle@example.com",
      role: "admin",
    });
    const assigned = detail.draft.scheduleCapacity.options.find(
      (option) => option.id === scenario.catalog.scheduleCapacity.id,
    );
    const target = detail.draft.scheduleCapacity.options.find(
      (option) => option.id === scenario.target.scheduleCapacity.id,
    );

    // The choreography being moved does not count against the capacity it
    // already occupies: its own option cannot show as full.
    expect(assigned?.isFull).toBe(false);
    expect(assigned?.label).toContain("0/5 ocupados");
    expect(target?.isFull).toBe(true);
    expect(target?.label).toContain("1/1 ocupados · sin cupo");
    // The assigned schedule's label still carries no occupancy.
    expect(detail.choreography.scheduleLabel).not.toContain("ocupados");
  });

  test("blocks the reassignment when the destination reprices an inscription below its deposit", async () => {
    const scenario = await createPriceDivergentScheduleScenario({
      academyName: "Academia Cronograma Señada",
      slug: "cronograma.senada",
    });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.senada.detalle@example.com",
      role: "admin",
    });
    // Read-only because the filter left nothing to move to, not because money
    // exists: the one alternative was the omitted one.
    expect(canPickScheduleCapacity(detail)).toBe(false);
    expect(detail.scheduleCapacity.blockers).toEqual([
      {
        code: "no-price-preserving-option",
        label:
          "No se puede reasignar el cupo de cronograma: ningún otro cronograma mantiene el precio.",
      },
    ]);
    // The repricing destination is omitted, not offered as disabled: only the
    // assignment is left in the select.
    expect(
      detail.draft.scheduleCapacity.options.map((option) => option.id),
    ).toEqual([scenario.catalog.scheduleCapacity.id]);

    const result = await scenario.reassignTo(
      scenario.target.scheduleCapacity.id,
    );

    // Absent from the accepted set, but reported as the price problem it is and
    // not as an incompatible selection.
    expect(result).toMatchObject({
      message: priceDivergenceScheduleCapacityMessage,
      status: "error",
    });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      scheduleId: scenario.catalog.schedule.id,
    });
  });

  test("omits only the alternatives that would reprice, and keeps the ones that hold the price", async () => {
    const { neutral, ...scenario } =
      await createPartiallyFilteredScheduleScenario({
        academyName: "Academia Cronograma Filtrado",
        slug: "cronograma.filtrado",
      });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.filtrado.detalle@example.com",
      role: "admin",
    });
    expect(
      detail.draft.scheduleCapacity.options.map((option) => option.id),
    ).toEqual(
      expect.arrayContaining([
        scenario.catalog.scheduleCapacity.id,
        neutral.scheduleCapacity.id,
      ]),
    );
    expect(
      detail.draft.scheduleCapacity.options.map((option) => option.id),
    ).not.toContain(scenario.target.scheduleCapacity.id);
    // Money on the choreography no longer closes the field: one alternative
    // holds the price, so there is something to choose and the select opens.
    expect(canPickScheduleCapacity(detail)).toBe(true);
    // The omission is not a disabling: nothing in the surviving list is marked
    // full, which is the only thing `isFull` ever means.
    expect(
      detail.draft.scheduleCapacity.options.every((option) => !option.isFull),
    ).toBe(true);

    // The intent accepts exactly what the loader offered: the neutral one goes
    // through, the omitted one is refused for its price.
    const refused = await scenario.reassignTo(
      scenario.target.scheduleCapacity.id,
    );
    expect(refused).toMatchObject({
      message: priceDivergenceScheduleCapacityMessage,
      status: "error",
    });

    const accepted = await scenario.reassignTo(neutral.scheduleCapacity.id);
    expect(accepted).toMatchObject({ status: "success" });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: neutral.scheduleCapacity.id,
      scheduleId: neutral.schedule.id,
    });
  });

  test("offers exactly the ids the intent accepts", async () => {
    const { neutral, ...scenario } =
      await createPartiallyFilteredScheduleScenario({
        academyName: "Academia Cronograma Invariante",
        slug: "cronograma.invariante",
      });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.invariante.detalle@example.com",
      role: "admin",
    });
    const offeredIds = new Set(
      detail.draft.scheduleCapacity.options.map((option) => option.id),
    );
    // Every capacity of the event, offered or omitted, put to the intent: the
    // invariant `resolveScheduleCapacityCandidates` documents is that the two
    // sets coincide, so an id the select omits has to be refused and every id
    // it offers has to go through. Asserted over the whole set rather than over
    // one example of each, which is how a filter and a guard reading the price
    // key from different sources would slip past.
    const candidateIds = [
      scenario.catalog.scheduleCapacity.id,
      neutral.scheduleCapacity.id,
      scenario.target.scheduleCapacity.id,
    ];
    const accepted: string[] = [];

    for (const candidateId of candidateIds) {
      const result = await scenario.reassignTo(candidateId);

      expect(result).not.toBeInstanceOf(Response);

      if ((result as { status: string }).status === "success") {
        accepted.push(candidateId);
      }

      // Put the choreography back on the catalogue's capacity, where the
      // scenario starts it, so each candidate is asked of the same assignment
      // the loader was asked of.
      await db
        .update(choreographies)
        .set({
          scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
          scheduleId: scenario.catalog.schedule.id,
        })
        .where(eq(choreographies.id, scenario.choreography.id));
    }

    expect(new Set(accepted)).toEqual(offeredIds);
  });

  test("omits a schedule that does not accept the choreography's category", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Por Categoría",
      slug: "cronograma.categoria",
    });
    // The alternative becomes the other show: it takes the modality, but only
    // for a category this choreography does not have.
    await db.insert(scheduleCategories).values({
      scheduleId: scenario.target.schedule.id,
      categoryId: scenario.catalog.categoryWithoutLevel.id,
    });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.categoria.detalle@example.com",
      role: "admin",
    });

    expect(
      detail.draft.scheduleCapacity.options.map((option) => option.id),
    ).toEqual([scenario.catalog.scheduleCapacity.id]);
    expect(canPickScheduleCapacity(detail)).toBe(false);

    // The save refuses exactly what the field never offered.
    await expect(
      scenario.reassignTo(scenario.target.scheduleCapacity.id),
    ).resolves.toMatchObject({
      message: compatibleScheduleSelectionRequiredMessage,
      status: "error",
    });
  });

  test("keeps an assignment that fell outside compatibility even when every alternative reprices", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Filtrado Deriva",
      slug: "cronograma.filtrado.deriva",
    });
    await insertSoloPrice({ amount: 10000, eventId: scenario.event.id });
    await insertSoloPrice({
      amount: 20000,
      eventId: scenario.event.id,
      scheduleId: scenario.target.schedule.id,
    });
    await insertSoloPrice({
      amount: 20000,
      eventId: scenario.event.id,
      scheduleId: scenario.catalog.schedule.id,
    });
    await createSelectedPriceInscriptionForTest({
      academyId: scenario.owner.academyId,
      allocatedAmount: 1000,
      choreographyId: scenario.choreography.id,
      eventId: scenario.event.id,
    });
    // The assignment drifts to a capacity of another modality: it is outside
    // compatibility *and* would reprice if it were an alternative, and it still
    // has to stay in the select rather than leave it empty.
    const foreignModality = await createModalityRecord({
      eventId: scenario.event.id,
      name: "Urbano",
    });
    const drifted = await createScheduleWithSoloCapacity({
      eventId: scenario.event.id,
      modalityId: foreignModality.id,
    });
    await db
      .update(choreographies)
      .set({
        scheduleCapacityId: drifted.scheduleCapacity.id,
        scheduleId: drifted.schedule.id,
      })
      .where(eq(choreographies.id, scenario.choreography.id));

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.filtrado.deriva@example.com",
      role: "admin",
    });

    expect(
      detail.draft.scheduleCapacity.options.map((option) => option.id),
    ).toEqual([drifted.scheduleCapacity.id]);
    // The assignment is in the select for visibility, not as a destination: it
    // is not an alternative, so the field stays read-only.
    expect(canPickScheduleCapacity(detail)).toBe(false);
  });

  // The #48 shape, and the majority of the fleet: money on a general row, past
  // its deposit. The price is frozen against that row whatever schedule the
  // choreography sits on, so the move cannot touch a peso.
  test("reassigns a frozen inscription that holds a general price row", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Congelada General",
      slug: "cronograma.congelada.general",
    });
    const generalPrice = await insertSoloPrice({
      amount: 10000,
      eventId: scenario.event.id,
    });
    // A dearer row on the destination, which the move would ride if the price
    // were still live.
    await insertSoloPrice({
      amount: 20000,
      eventId: scenario.event.id,
      scheduleId: scenario.target.schedule.id,
    });
    await createSelectedPriceInscriptionForTest({
      academyId: scenario.owner.academyId,
      allocatedAmount: 3000,
      choreographyId: scenario.choreography.id,
      eventId: scenario.event.id,
      selectedPriceId: generalPrice.id,
    });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email:
        "admin.coreografias.cronograma.congelada.general.detalle@example.com",
      role: "admin",
    });
    // Frozen against a general row: the dearer destination cannot reach it, so
    // the option is not filtered out and the field opens with money on the
    // choreography, which the blanket block used to close outright.
    expect(
      detail.draft.scheduleCapacity.options.map((option) => option.id),
    ).toContain(scenario.target.scheduleCapacity.id);
    expect(canPickScheduleCapacity(detail)).toBe(true);

    const result = await scenario.reassignTo(
      scenario.target.scheduleCapacity.id,
    );

    expect(result).toMatchObject({ status: "success" });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.target.scheduleCapacity.id,
      scheduleId: scenario.target.schedule.id,
    });
  });

  test("blocks a reassignment whose destination price row is pinned to the schedule it leaves", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Congelada Fijada",
      slug: "cronograma.congelada.fijada",
    });
    // The same amount on both sides: only the pinning of the stored row makes
    // this move refusable, and re-pointing it is exactly what the freeze
    // promises not to do.
    const pinnedPrice = await insertSoloPrice({
      amount: 10000,
      eventId: scenario.event.id,
      scheduleId: scenario.catalog.schedule.id,
    });
    await insertSoloPrice({
      amount: 10000,
      eventId: scenario.event.id,
      scheduleId: scenario.target.schedule.id,
    });
    await createSelectedPriceInscriptionForTest({
      academyId: scenario.owner.academyId,
      allocatedAmount: 3000,
      choreographyId: scenario.choreography.id,
      eventId: scenario.event.id,
      selectedPriceId: pinnedPrice.id,
    });

    const result = await scenario.reassignTo(
      scenario.target.scheduleCapacity.id,
    );

    expect(result).toMatchObject({ status: "error" });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      scheduleId: scenario.catalog.schedule.id,
    });
    const inscription = await db.query.choreographyDancers.findFirst({
      columns: { selectedPriceId: true },
      where: eq(choreographyDancers.choreographyId, scenario.choreography.id),
    });
    expect(inscription?.selectedPriceId).toBe(pinnedPrice.id);
  });

  test("reassigns when the inscriptions carry no deposit snapshot", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Impaga",
      slug: "cronograma.impaga",
    });
    const dancer = await createDancer(scenario.owner.academyId, {
      firstName: "Sol",
      lastName: "Rivas",
    });
    await db.insert(choreographyDancers).values({
      ageAtEventStart: 14,
      choreographyId: scenario.choreography.id,
      dancerId: dancer.id,
    });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.impaga.detalle@example.com",
      role: "admin",
    });
    expect(detail.scheduleCapacity.blockers).toEqual([]);
    expect(canPickScheduleCapacity(detail)).toBe(true);

    const result = await scenario.reassignTo(
      scenario.target.scheduleCapacity.id,
    );

    expect(result).toMatchObject({ status: "success" });
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.target.scheduleCapacity.id,
      scheduleId: scenario.target.schedule.id,
    });
  });

  test("shows the price blocker to auditors as well", async () => {
    const scenario = await createPriceDivergentScheduleScenario({
      academyName: "Academia Cronograma Señada Auditor",
      slug: "cronograma.senada.auditor",
    });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "auditor.coreografias.cronograma.senada@example.com",
      role: "auditor",
    });

    expect(
      detail.scheduleCapacity.blockers.map((blocker) => blocker.code),
    ).toEqual(["no-price-preserving-option"]);
  });

  test("announces the filter as partial when an alternative keeps the price", async () => {
    const { neutral, ...scenario } =
      await createPartiallyFilteredScheduleScenario({
        academyName: "Academia Cronograma Parcial",
        slug: "cronograma.parcial",
      });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.parcial.detalle@example.com",
      role: "admin",
    });

    // The field stays open: one alternative survived the filter.
    expect(canPickScheduleCapacity(detail)).toBe(true);
    expect(detail.scheduleCapacity.blockers).toEqual([
      {
        code: "price-filtered-options",
        label:
          "El cupo de cronograma solo ofrece los cronogramas que mantienen el precio.",
      },
    ]);
    // The alert names no destination and no amount: the select already lists
    // what is on offer, and an enumeration would go stale.
    expect(detail.scheduleCapacity.blockers[0]?.label).not.toContain("20.000");
    expect(
      detail.draft.scheduleCapacity.options.map((option) => option.id).sort(),
    ).toEqual(
      [
        scenario.catalog.scheduleCapacity.id,
        neutral.scheduleCapacity.id,
      ].sort(),
    );
  });

  test("announces nothing when the money holds its price on every option", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Sin Divergencia",
      slug: "cronograma.sin.divergencia",
    });
    await insertSoloPrice({ amount: 10000, eventId: scenario.event.id });
    await createSelectedPriceInscriptionForTest({
      academyId: scenario.owner.academyId,
      allocatedAmount: 1000,
      choreographyId: scenario.choreography.id,
      eventId: scenario.event.id,
    });

    const detail = await loadDetail({
      choreographyId: scenario.choreography.id,
      email: "admin.coreografias.cronograma.sin.divergencia@example.com",
      role: "admin",
    });

    // Money alone says nothing any more: no option would reprice it, so there
    // is nothing to announce.
    expect(detail.scheduleCapacity.blockers).toEqual([]);
    expect(canPickScheduleCapacity(detail)).toBe(true);
  });

  test("blocks auditors from reassigning the schedule capacity", async () => {
    const scenario = await createScheduleCapacityScenario({
      academyName: "Academia Cronograma Auditor",
      slug: "cronograma.auditor",
    });

    await expectThrownResponse(
      submitDraftAsAuditor({
        choreographyId: scenario.choreography.id,
        edits: { scheduleCapacityId: scenario.target.scheduleCapacity.id },
      }),
      403,
    );
    await expect(scenario.readAssignment()).resolves.toEqual({
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      scheduleId: scenario.catalog.schedule.id,
    });
  });
});

async function createModalityRecord(input: { eventId: string; name: string }) {
  const [modality] = await db
    .insert(modalities)
    .values({ eventId: input.eventId, name: input.name })
    .returning();

  return modality;
}

/**
 * A `solo` price with no payment deadline, so it is the row that applies
 * whatever day the suite runs on. Pinned to a schedule when one is given.
 */
async function insertSoloPrice(input: {
  amount: number;
  eventId: string;
  scheduleId?: string;
}) {
  const [price] = await insertTestPrices([
    {
      amount: input.amount,
      eventId: input.eventId,
      groupType: "solo",
      name: `Precio Solo ${input.amount} ${input.scheduleId ?? "general"}`,
      paymentDeadline: null,
      scheduleIds: input.scheduleId ? [input.scheduleId] : [],
    },
  ]);

  return price;
}

async function createScheduleWithSoloCapacity(input: {
  capacity?: number;
  eventId: string;
  modalityId: string;
}) {
  const schedule = await createScheduleForModalityFixture({
    eventId: input.eventId,
    modalityId: input.modalityId,
  });
  const [scheduleCapacity] = await db
    .insert(scheduleCapacities)
    .values({
      scheduleId: schedule.id,
      groupType: "solo",
      capacity: input.capacity ?? 5,
    })
    .returning();

  return { schedule, scheduleCapacity };
}

/**
 * A choreography registered in the catalogue's capacity and a second compatible
 * schedule to reassign it to: the minimum for the resolution to be `multiple`
 * and the field to be enabled.
 */
async function createScheduleCapacityScenario(input: {
  academyName: string;
  isEvaluated?: boolean;
  slug: string;
  targetCapacity?: number;
}) {
  const owner = await createAcademySession({
    academyName: input.academyName,
    email: `admin.coreografias.${input.slug}.academia@example.com`,
  });
  const event = await createEventRecord({
    active: true,
    name: "Regional 2026",
  });
  const catalog = await createEventCatalog(event.id);
  const target = await createScheduleWithSoloCapacity({
    capacity: input.targetCapacity,
    eventId: event.id,
    modalityId: catalog.modality.id,
  });
  const choreography = await createChoreographyRecord({
    academyId: owner.academyId,
    categoryId: catalog.categoryWithLevel.id,
    eventId: event.id,
    experienceLevelId: catalog.level.id,
    modalityId: catalog.modality.id,
    name: "Con cronograma",
    scheduleCapacityId: catalog.scheduleCapacity.id,
    submodalityId: catalog.submodality.id,
  });

  if (input.isEvaluated) {
    evaluatedChoreographyIds.add(choreography.id);
  }

  return {
    catalog,
    choreography,
    event,
    owner,
    async readAssignment(choreographyId = choreography.id) {
      return await db.query.choreographies.findFirst({
        columns: { scheduleCapacityId: true, scheduleId: true },
        where: eq(choreographies.id, choreographyId),
      });
    },
    async reassignTo(
      optionId: string,
      options: { choreographyId?: string } = {},
    ) {
      return await saveDraftEdits({
        choreographyId: options.choreographyId ?? choreography.id,
        edits: { scheduleCapacityId: optionId },
      });
    },
    target,
  };
}

/**
 * The reassignment scenario in its repricing shape: money below its deposit, so
 * the price is still live, and the only alternative carrying a dearer row of
 * its own, so moving there is what changes what the inscription is charged.
 */
async function createPriceDivergentScheduleScenario(input: {
  academyName: string;
  slug: string;
}) {
  const scenario = await createScheduleCapacityScenario(input);
  await insertSoloPrice({ amount: 10000, eventId: scenario.event.id });
  await insertSoloPrice({
    amount: 20000,
    eventId: scenario.event.id,
    scheduleId: scenario.target.schedule.id,
  });
  // Below its deposit (30 % of 10000), so the stored row is not authoritative
  // and the destination's own row is what it would be charged at.
  await createSelectedPriceInscriptionForTest({
    academyId: scenario.owner.academyId,
    allocatedAmount: 1000,
    choreographyId: scenario.choreography.id,
    eventId: scenario.event.id,
  });

  return scenario;
}

/**
 * The same shape plus a third compatible schedule with no row of its own: it
 * rides the general row the assignment does, so it survives the filter and
 * leaves something to move to.
 */
async function createPartiallyFilteredScheduleScenario(input: {
  academyName: string;
  slug: string;
}) {
  const scenario = await createPriceDivergentScheduleScenario(input);
  const neutral = await createScheduleWithSoloCapacity({
    eventId: scenario.event.id,
    modalityId: scenario.catalog.modality.id,
  });

  return { ...scenario, neutral };
}
