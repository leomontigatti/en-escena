import { insertTestPrices } from "@/lib/prices/price-rows.test-support";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  categories,
  categoryModalities,
  choreographies,
  modalities,
  scheduleCapacities,
  scheduleModalities,
  schedules,
  submodalities,
} from "@/db/schema";
import {
  handleChoreographyDetailAction,
  loadChoreographyDetailRouteData,
  type ChoreographyDetailActionData,
} from "@/features/admin/choreographies/detail/server";
import { toSavedChoreographyDraft } from "@/features/admin/choreographies/detail/draft-form";
import {
  resolveChoreographyDraftIntent,
  saveChoreographyDraftIntent,
  toChoreographyDraftFormData,
  type ChoreographyDraft,
  type ChoreographyDraftPreview,
} from "@/features/admin/choreographies/detail/draft.shared";
import {
  createAcademySession,
  createChoreographyRecord,
  createEventCatalog,
  createEventRecord,
  createSelectedPriceInscriptionForTest,
} from "@/features/portal/choreographies/test-support/db";
import {
  createSignedInAdminRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import {
  evaluatedChoreographyMessage,
  noCompatibleCategoryModalityMessage,
} from "@/lib/choreographies/choreography-messages";
import { priceDivergenceScheduleCapacityMessage } from "@/lib/choreographies/schedule-capacity-lock.server";
import { createScheduleForModalityFixture } from "@/lib/choreographies/registration-test-fixtures.server.db";
import type { ExperienceLevel } from "@/lib/events/experience-levels";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";
import { evaluatedChoreographyIds } from "@/lib/presentations/evaluation-lock.test-support";

// Reaching a real evaluation means a score on an assigned judge, which is not
// this file's subject, so a test that needs a closed choreography declares it
// through the stub instead.
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

describe("administrative choreography modality correction", () => {
  /**
   * Occupancy is a suffix on the options a select offers. The lone compatible
   * capacity is not offered: it arrives preselected and read-only, and saying
   * how many places are left on a field nobody can change means nothing. So
   * its label carries none, and the date-time the view composes from it is
   * bare. `isFull` still comes from the occupancy read: a lone full capacity is
   * the dead end the view explains instead.
   */
  test("previews the locked single capacity with no occupancy on its label", async () => {
    const scenario = await createModalityScenario({ slug: "cupo-unico" });

    const preview = await scenario.resolveModality(scenario.target.modality.id);

    expect(preview.scheduleCapacity.selectedId).toBe(
      scenario.target.scheduleCapacity.id,
    );
    expect(preview.scheduleCapacity.options).toEqual([
      {
        id: scenario.target.scheduleCapacity.id,
        isFull: false,
        label: expect.stringContaining("1 de mayo de 2026"),
      },
    ]);
    expect(preview.scheduleCapacity.options[0]?.label).not.toContain(
      "ocupados",
    );
  });

  /**
   * The other half of the same rule, so the fix cannot be read as "strip the
   * suffix everywhere": where there *is* a capacity to choose, every label the
   * select offers keeps its occupancy.
   */
  test("keeps occupancy on the labels when there is a capacity to choose", async () => {
    const scenario = await createModalityScenario({
      slug: "cupo-multiple",
      targetHasSecondCapacity: true,
    });

    const preview = await scenario.resolveModality(scenario.target.modality.id);

    expect(preview.scheduleCapacity.options).toHaveLength(2);
    // Two compatible capacities are a choice: nothing is picked for the admin.
    expect(preview.scheduleCapacity.selectedId).toBeNull();

    for (const option of preview.scheduleCapacity.options) {
      expect(option.label).toContain("0/5 ocupados");
    }
  });

  test("writes the destination modality with its category and capacity, and clears a level its category does not take", async () => {
    const scenario = await createModalityScenario({ slug: "compuesta" });

    const response = await scenario.saveModality(scenario.target.modality.id);

    expect(response).toMatchObject({
      message: "Coreografía guardada.",
      status: "success",
    });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      categoryId: scenario.target.category.id,
      experienceLevelId: null,
      modalityId: scenario.target.modality.id,
      scheduleCapacityId: scenario.target.scheduleCapacity.id,
      scheduleId: scenario.target.schedule.id,
      submodalityId: scenario.target.submodality?.id,
    });
  });

  test("cannot leave the choreography pointing at a submodality of another modality", async () => {
    const scenario = await createModalityScenario({ slug: "submodalidad" });

    const response = await scenario.saveModality(scenario.target.modality.id, {
      submodalityId: scenario.catalog.submodality.id,
    });

    expect(response).toMatchObject({
      message: "Elegí una submodalidad válida para la modalidad seleccionada.",
      status: "error",
    });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      modalityId: scenario.catalog.modality.id,
      submodalityId: scenario.catalog.submodality.id,
    });
  });

  test("requires a submodality when the destination modality has them", async () => {
    const scenario = await createModalityScenario({
      slug: "submodalidad-falta",
    });

    const response = await scenario.saveModality(scenario.target.modality.id, {
      submodalityId: "",
    });

    expect(response).toMatchObject({
      message: "Elegí una submodalidad para la modalidad seleccionada.",
      status: "error",
    });
  });

  test("clears the submodality when the destination modality has none", async () => {
    const scenario = await createModalityScenario({
      slug: "sin-submodalidad",
      targetHasSubmodality: false,
    });

    const response = await scenario.saveModality(scenario.target.modality.id);

    expect(response).toMatchObject({ status: "success" });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      modalityId: scenario.target.modality.id,
      submodalityId: null,
    });
  });

  test("requires a level when the resolved category declares them and clears it when the category changes", async () => {
    const scenario = await createModalityScenario({
      slug: "nivel",
      targetCategoryLevels: ["profesional"],
    });

    const missingLevel = await scenario.saveModality(
      scenario.target.modality.id,
      { experienceLevelId: "" },
    );

    expect(missingLevel).toMatchObject({ status: "error" });

    const response = await scenario.saveModality(scenario.target.modality.id);

    expect(response).toMatchObject({ status: "success" });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      categoryId: scenario.target.category.id,
      experienceLevelId: "profesional",
    });
  });

  test("refuses the correction when no category resolves for the destination modality", async () => {
    const scenario = await createModalityScenario({
      slug: "sin-categoria",
      targetCategoryMaxAge: 12,
      targetCategoryMinAge: 8,
    });

    const response = await scenario.saveModality(scenario.target.modality.id);

    expect(response).toMatchObject({
      message: noCompatibleCategoryModalityMessage,
      status: "error",
    });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      categoryId: scenario.catalog.categoryWithLevel.id,
      experienceLevelId: scenario.catalog.level.id,
      modalityId: scenario.catalog.modality.id,
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      submodalityId: scenario.catalog.submodality.id,
    });
  });

  test("moves the capacity when the current one stops being compatible", async () => {
    const scenario = await createModalityScenario({ slug: "cupo" });

    await scenario.saveModality(scenario.target.modality.id);

    await expect(scenario.readChoreography()).resolves.toMatchObject({
      scheduleCapacityId: scenario.target.scheduleCapacity.id,
      scheduleId: scenario.target.schedule.id,
    });
  });

  // The dead end the omission creates: the modality select stays structural, so
  // this modality is offered, and every capacity behind it would reprice.
  test("previews no capacity at all when every one of them would reprice", async () => {
    const scenario = await createModalityScenario({
      allocatedAmount: 5000,
      slug: "sena-sin-cupo",
    });

    const preview = await scenario.resolveModality(scenario.target.modality.id);

    expect(preview.scheduleCapacity).toEqual({
      options: [],
      selectedId: null,
    });
    expect(preview.blockers).toContainEqual({
      code: "schedule-capacity",
      message: priceDivergenceScheduleCapacityMessage,
    });
    // The modality is still offered: money never greys a modality, and the
    // detail explains the dead end at the capacity instead.
    const detail = await scenario.loadDetail();
    expect(
      detail.modality.options.find(
        (option) => option.id === scenario.target.modality.id,
      ),
    ).toMatchObject({ hasCompatibleScheduleCapacity: true });
  });

  test("accepts the correction when a deposit is registered and the capacity does not move", async () => {
    const scenario = await createModalityScenario({
      allocatedAmount: 5000,
      slug: "sena-inerte",
      targetSharesSchedule: true,
    });

    const response = await scenario.saveModality(scenario.target.modality.id);

    expect(response).toMatchObject({ status: "success" });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      modalityId: scenario.target.modality.id,
      scheduleCapacityId: scenario.catalog.scheduleCapacity.id,
      scheduleId: scenario.catalog.schedule.id,
    });
  });

  test("rejects a modality the view renders disabled, even submitted by hand", async () => {
    const scenario = await createModalityScenario({ slug: "sin-cronograma" });

    const response = await scenario.saveModality(scenario.deadEndModality.id);

    expect(response).toMatchObject({
      message:
        "No se puede cambiar la modalidad: ningún cronograma del evento acepta esa modalidad.",
      status: "error",
    });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      modalityId: scenario.catalog.modality.id,
    });
  });

  test("treats re-selecting the assigned modality as a successful no-op", async () => {
    const scenario = await createModalityScenario({ slug: "no-op" });

    const response = await scenario.saveModality(scenario.catalog.modality.id);

    expect(response).toMatchObject({ status: "success" });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      categoryId: scenario.catalog.categoryWithLevel.id,
      modalityId: scenario.catalog.modality.id,
      submodalityId: scenario.catalog.submodality.id,
    });
  });

  test("hard-locks the correction once the choreography was evaluated", async () => {
    const scenario = await createModalityScenario({
      isEvaluated: true,
      slug: "evaluada",
    });

    const detail = await scenario.loadDetail();

    expect(detail.draft.structuralLock).toBe(evaluatedChoreographyMessage);

    const response = await scenario.saveModality(scenario.target.modality.id);

    expect(response).toMatchObject({
      message: evaluatedChoreographyMessage,
      status: "error",
    });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      modalityId: scenario.catalog.modality.id,
    });
  });

  test("offers every modality of the event, marking the ones no schedule accepts", async () => {
    const scenario = await createModalityScenario({
      allocatedAmount: 5000,
      slug: "opciones",
    });

    const detail = await scenario.loadDetail();

    expect(detail.canEdit).toBe(true);
    expect(detail.draft.structuralLock).toBeNull();
    expect(detail.modality.blockers).toEqual([
      {
        code: "price-change",
        label:
          "Solo se puede corregir la modalidad si el cronograma no cambia de precio: hay inscripciones con dinero asignado.",
      },
    ]);
    expect(
      detail.modality.options.map((option) => ({
        hasCompatibleScheduleCapacity: option.hasCompatibleScheduleCapacity,
        id: option.id,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          hasCompatibleScheduleCapacity: true,
          id: scenario.catalog.modality.id,
        },
        {
          hasCompatibleScheduleCapacity: true,
          id: scenario.target.modality.id,
        },
        {
          hasCompatibleScheduleCapacity: false,
          id: scenario.deadEndModality.id,
        },
      ]),
    );
  });

  test("announces no modality blocker when no schedule would change the price", async () => {
    // The destination modality shares the choreography's schedule, so the
    // event has a single schedule and no correction can move the price key.
    const scenario = await createModalityScenario({
      allocatedAmount: 5000,
      slug: "sin.divergencia",
      targetSharesSchedule: true,
    });

    const detail = await scenario.loadDetail();

    // Holding money is no longer the question: what closes on price is a
    // destination that would reprice it, and there is none.
    expect(detail.modality.blockers).toEqual([]);
  });

  test("ignores a schedule no modality accepts when announcing the blocker", async () => {
    // Every reachable destination keeps the price, and the only schedule that
    // would move it is one no correction can land on: it takes no modality, so
    // it is a structural dead end and the caveat would be about nothing.
    const scenario = await createModalityScenario({
      allocatedAmount: 5000,
      slug: "cronograma.huerfano",
      targetSharesSchedule: true,
    });
    const [orphanSchedule] = await db
      .insert(schedules)
      .values({
        eventId: scenario.event.id,
        name: "Bloque sin modalidad",
        scheduledDate: "2026-05-02",
        startTime: "10:00",
        totalCapacity: 10,
      })
      .returning();
    await insertTestPrices([
      {
        amount: 30000,
        eventId: scenario.event.id,
        groupType: "solo",
        name: "Precio Solo huérfano",
        paymentDeadline: null,
        scheduleIds: [orphanSchedule.id],
      },
    ]);

    const detail = await scenario.loadDetail();

    expect(detail.modality.blockers).toEqual([]);
  });

  test("keeps the correction read-only for auditors", async () => {
    const scenario = await createModalityScenario({ slug: "auditor" });

    const detail = await scenario.loadDetail("auditor");

    expect(detail.canEdit).toBe(false);
    await expectThrownResponse(
      scenario.saveModality(scenario.target.modality.id, {}, "auditor"),
      403,
    );
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      modalityId: scenario.catalog.modality.id,
    });
  });
});

/**
 * A choreography registered in the catalogue modality, a complete destination
 * modality —with its own compatible schedule, its submodality and its
 * category— and a third one with no schedule: the minimum needed to exercise
 * the four things the modality determines, plus the dead end the select offers
 * disabled.
 */
async function createModalityScenario(input: {
  allocatedAmount?: number;
  isEvaluated?: boolean;
  slug: string;
  targetCategoryLevels?: ExperienceLevel[];
  targetCategoryMaxAge?: number;
  targetCategoryMinAge?: number;
  targetHasSecondCapacity?: boolean;
  targetHasSubmodality?: boolean;
  targetSharesSchedule?: boolean;
}) {
  // Every signed request creates its own user, so each one needs a distinct
  // email.
  let requestCount = 0;
  const nextEmail = (role: "admin" | "auditor") =>
    `${role}.coreografias.modalidad.${input.slug}.${(requestCount += 1)}@example.com`;
  const owner = await createAcademySession({
    academyName: `Academia ${input.slug}`,
    email: `admin.coreografias.modalidad.${input.slug}.academia@example.com`,
  });
  const event = await createEventRecord({
    active: true,
    name: "Regional 2026",
  });
  const catalog = await createEventCatalog(event.id);
  const target = await createTargetModality({
    categoryLevels: input.targetCategoryLevels ?? [],
    categoryMaxAge: input.targetCategoryMaxAge ?? 17,
    categoryMinAge: input.targetCategoryMinAge ?? 13,
    eventId: event.id,
    hasSecondCapacity: input.targetHasSecondCapacity ?? false,
    hasSubmodality: input.targetHasSubmodality ?? true,
    name: `Urbano ${input.slug}`,
    sharedSchedule: input.targetSharesSchedule
      ? {
          id: catalog.schedule.id,
          scheduleCapacity: catalog.scheduleCapacity,
        }
      : null,
  });
  const [deadEndModality] = await db
    .insert(modalities)
    .values({ eventId: event.id, name: `Folclore ${input.slug}` })
    .returning();
  const choreography = await createChoreographyRecord({
    academyId: owner.academyId,
    categoryId: catalog.categoryWithLevel.id,
    eventId: event.id,
    experienceLevelId: catalog.level.id,
    modalityId: catalog.modality.id,
    name: "Con modalidad",
    scheduleCapacityId: catalog.scheduleCapacity.id,
    submodalityId: catalog.submodality.id,
  });

  if (input.isEvaluated) {
    evaluatedChoreographyIds.add(choreography.id);
  }
  // Deadline-less rows, so they are the ones that apply whatever day the suite
  // runs on, and the destination schedule carries a dearer one: with money on
  // the choreography, moving the schedule is what changes the price.
  await insertTestPrices([
    {
      amount: 10000,
      eventId: event.id,
      groupType: "solo",
      name: `Precio Solo ${input.slug}`,
      paymentDeadline: null,
    },
    {
      amount: 20000,
      eventId: event.id,
      groupType: "solo",
      name: `Precio Solo destino ${input.slug}`,
      paymentDeadline: null,
      scheduleIds: [target.schedule.id],
    },
  ]);
  await createSelectedPriceInscriptionForTest({
    academyId: owner.academyId,
    allocatedAmount: input.allocatedAmount,
    choreographyId: choreography.id,
    eventId: event.id,
  });

  async function submit(input: {
    draft: ChoreographyDraft;
    intent:
      | typeof resolveChoreographyDraftIntent
      | typeof saveChoreographyDraftIntent;
    previewedCategoryId?: string | null;
    role?: "admin" | "auditor";
  }) {
    const role = input.role ?? "admin";

    return await submitDetailAction({
      body: toChoreographyDraftFormData(input),
      choreographyId: choreography.id,
      email: nextEmail(role),
      role,
    });
  }

  async function readModalityDraft(modalityId: string) {
    const { request } = await createSignedInAdminRequest({
      email: nextEmail("admin"),
      requestUrl: `http://localhost/administracion/coreografias/${choreography.academyId}/${choreography.id}`,
      role: "admin",
    });
    const detail = await loadChoreographyDetailRouteData({
      params: {
        academyId: choreography.academyId,
        choreographyId: choreography.id,
      },
      request,
    });

    return {
      ...toSavedChoreographyDraft(detail.choreography),
      modalityId,
      submodalityId:
        modalityId === detail.choreography.modalityId
          ? (detail.choreography.submodalityId ?? "")
          : "",
    };
  }

  return {
    catalog,
    choreography,
    deadEndModality,
    event,
    owner,
    async loadDetail(role: "admin" | "auditor" = "admin") {
      const { request } = await createSignedInAdminRequest({
        email: nextEmail(role),
        requestUrl: `http://localhost/administracion/coreografias/${choreography.academyId}/${choreography.id}`,
        role,
      });

      return await loadChoreographyDetailRouteData({
        params: {
          academyId: choreography.academyId,
          choreographyId: choreography.id,
        },
        request,
      });
    },
    async readChoreography() {
      return await db.query.choreographies.findFirst({
        where: eq(choreographies.id, choreography.id),
      });
    },
    /**
     * What the form asks while the modality is being picked: the saved
     * choreography as the draft, with the submodality left to choose.
     */
    async resolveModality(modalityId: string) {
      return readDraftPreview(
        await submit({
          draft: await readModalityDraft(modalityId),
          intent: resolveChoreographyDraftIntent,
        }),
      );
    },
    /**
     * Saves the correction with the fields the form would have filled from the
     * preview, so each test overrides only the one it exercises.
     */
    async saveModality(
      modalityId: string,
      overrides: Partial<ChoreographyDraft> = {},
      role: "admin" | "auditor" = "admin",
    ) {
      const draft = await readModalityDraft(modalityId);
      const preview = readDraftPreview(
        await submit({
          draft,
          intent: resolveChoreographyDraftIntent,
          role,
        }),
      );

      return await submit({
        draft: {
          ...draft,
          experienceLevelId: preview.experienceLevel.options[0]?.id ?? "",
          scheduleCapacityId: preview.scheduleCapacity.selectedId ?? "",
          submodalityId: preview.submodality.options[0]?.id ?? "",
          ...overrides,
        },
        intent: saveChoreographyDraftIntent,
        previewedCategoryId: preview.category?.id ?? null,
        role,
      });
    },
    target,
  };
}

function readDraftPreview(
  response: ChoreographyDetailActionData | Response,
): ChoreographyDraftPreview {
  if (
    response instanceof Response ||
    !("intent" in response) ||
    response.intent !== resolveChoreographyDraftIntent
  ) {
    throw new Error("the action did not answer the draft preview");
  }

  return response.preview;
}

async function createTargetModality(input: {
  categoryLevels: ExperienceLevel[];
  categoryMaxAge: number;
  categoryMinAge: number;
  eventId: string;
  hasSecondCapacity: boolean;
  hasSubmodality: boolean;
  name: string;
  sharedSchedule: {
    id: string;
    scheduleCapacity: { id: string };
  } | null;
}) {
  const [modality] = await db
    .insert(modalities)
    .values({ eventId: input.eventId, name: input.name })
    .returning();
  const [submodality] = input.hasSubmodality
    ? await db
        .insert(submodalities)
        .values({
          eventId: input.eventId,
          modalityId: modality.id,
          name: `Hip hop ${input.name}`,
        })
        .returning()
    : [null];
  const [category] = await db
    .insert(categories)
    .values({
      eventId: input.eventId,
      name: `Juvenil ${input.name}`,
      minAge: input.categoryMinAge,
      maxAge: input.categoryMaxAge,
      groupTypes: ["solo"],
      groupTypeKey: "solo",
      experienceLevels: input.categoryLevels,
      experienceLevelKey: input.categoryLevels.join("|"),
    })
    .returning();
  await db
    .insert(categoryModalities)
    .values({ categoryId: category.id, modalityId: modality.id });

  if (input.sharedSchedule) {
    await db.insert(scheduleModalities).values({
      modalityId: modality.id,
      scheduleId: input.sharedSchedule.id,
    });

    return {
      category,
      modality,
      schedule: { id: input.sharedSchedule.id },
      scheduleCapacity: input.sharedSchedule.scheduleCapacity,
      submodality,
    };
  }

  const schedule = await createScheduleForModalityFixture({
    eventId: input.eventId,
    modalityId: modality.id,
  });
  const [scheduleCapacity] = await db
    .insert(scheduleCapacities)
    .values({ scheduleId: schedule.id, groupType: "solo", capacity: 5 })
    .returning();

  // A second compatible capacity turns the destination into a real choice, so
  // the preview reports `multiple` instead of the preselected `auto`.
  if (input.hasSecondCapacity) {
    const secondSchedule = await createScheduleForModalityFixture({
      eventId: input.eventId,
      modalityId: modality.id,
    });
    await db.insert(scheduleCapacities).values({
      scheduleId: secondSchedule.id,
      groupType: "solo",
      capacity: 5,
    });
  }

  return { category, modality, schedule, scheduleCapacity, submodality };
}

async function submitDetailAction(input: {
  body: FormData;
  choreographyId: string;
  email: string;
  role: "admin" | "auditor";
}) {
  const params = await readDetailParams(input.choreographyId);
  const { request } = await createSignedInAdminRequest({
    body: input.body,
    email: input.email,
    requestUrl: `http://localhost/administracion/coreografias/${params.academyId}/${input.choreographyId}`,
    role: input.role,
  });

  return await handleChoreographyDetailAction({ params, request });
}

async function readDetailParams(choreographyId: string) {
  const row = await db.query.choreographies.findFirst({
    columns: { academyId: true },
    where: eq(choreographies.id, choreographyId),
  });

  if (!row) {
    throw new Error(`Choreography ${choreographyId} is not seeded`);
  }

  return { academyId: row.academyId, choreographyId };
}
