import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  categories,
  categoryModalities,
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  modalities,
  prices,
  scheduleCapacities,
  scheduleCategories,
  scheduleModalities,
  schedules,
  submodalities,
} from "@/db/schema";
import {
  handleChoreographyDetailAction,
  type ChoreographyDetailActionData,
} from "@/features/admin/choreographies/detail/server";
import {
  resolveChoreographyDraftIntent,
  saveChoreographyDraftIntent,
  toChoreographyDraftFormData,
  type ChoreographyDraft,
  type ChoreographyDraftPreview,
} from "@/features/admin/choreographies/detail/draft.shared";
import {
  createChoreographyRecord,
  createSelectedPriceInscriptionForTest,
} from "@/features/portal/choreographies/test-support/db";
import { createSignedInAdminRequest } from "@/lib/admin/test-support/db";
import {
  evaluatedChoreographyMessage,
  noCompatibleCategoryModalityMessage,
} from "@/lib/choreographies/choreography-messages";
import {
  createAcademySession,
  createDancer,
  createEventCatalog,
  createEventRecord,
  createGrupalOnlyModalityFixture,
  createProfessor,
  createScheduleForModalityFixture,
} from "@/lib/choreographies/registration-test-fixtures.server.db";
import { getGlobalScheduleCapacityOptionId } from "@/lib/choreographies/choreography-roster.shared";
import {
  getAgeAtDate,
  getEventLocalDateParts,
} from "@/lib/choreographies/registration-resolution.server";
import { priceDivergenceScheduleCapacityMessage } from "@/lib/choreographies/schedule-capacity-lock.server";
import type { ExperienceLevel } from "@/lib/events/experience-levels";
import { evaluatedChoreographyIds } from "@/lib/presentations/evaluation-lock.test-support";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

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

describe("previewing a draft of the choreography detail", () => {
  test("resolves a dancers-only draft to the new group type and its capacity, and writes nothing", async () => {
    const scenario = await createDraftScenario({ slug: "solo-a-duo" });

    const preview = await scenario.resolveDraft(
      scenario.draft({ dancerIds: [scenario.ana.id, scenario.bea.id] }),
    );

    expect(preview.category?.id).toBe(scenario.catalog.teenCategory.id);
    expect(preview.groupType).toBe("duo");
    expect(preview.scheduleCapacity.selectedId).toBe(
      scenario.catalog.duoScheduleCapacity.id,
    );
    expect(preview.blockers).toEqual([]);
    expect(preview.consequences).toMatchObject({
      groupType: { from: "solo", to: "duo" },
      price: { from: 10000, to: 15000 },
      // The duo capacity is on the same schedule: nothing the administrator
      // reads as `Cronograma` moves.
      scheduleCapacity: null,
      withdrawnDancers: [],
    });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      groupType: "solo",
      scheduleCapacityId: scenario.catalog.soloScheduleCapacity.id,
    });
    await expect(scenario.readActiveDancerIds()).resolves.toEqual([
      scenario.ana.id,
    ]);
  });

  test("resolves a modality-only draft to the new modality's category, submodalities and capacity", async () => {
    const scenario = await createDraftScenario({ slug: "solo-modalidad" });
    const target = await createTargetModality(scenario.event.id, {
      levels: ["amateur"],
      withSubmodality: true,
    });

    const preview = await scenario.resolveDraft(
      scenario.draft({ modalityId: target.modality.id, submodalityId: "" }),
    );

    expect(preview.category).toEqual({
      id: target.category.id,
      name: target.category.name,
    });
    expect(preview.submodality.options).toEqual([
      { id: target.submodality?.id, name: target.submodality?.name },
    ]);
    expect(preview.experienceLevel).toMatchObject({ required: true });
    // The lone compatible capacity arrives preselected.
    expect(preview.scheduleCapacity.options).toHaveLength(1);
    expect(preview.scheduleCapacity.selectedId).toBe(target.soloCapacity.id);
  });

  test("resolves the new modality with the new roster when both change", async () => {
    const scenario = await createDraftScenario({ slug: "ambos" });
    const target = await createTargetModality(scenario.event.id);

    const preview = await scenario.resolveDraft(
      scenario.draft({
        dancerIds: [scenario.ana.id, scenario.bea.id],
        modalityId: target.modality.id,
        submodalityId: "",
      }),
    );

    expect(preview.category?.id).toBe(target.category.id);
    expect(preview.groupType).toBe("duo");
    expect(preview.scheduleCapacity.selectedId).toBe(target.duoCapacity.id);
    expect(preview.consequences.category).toEqual({
      from: scenario.catalog.teenCategory.name,
      to: target.category.name,
    });
  });

  test("keeps the capacity it holds while it still fits, even beside another compatible one", async () => {
    const scenario = await createDraftScenario({ slug: "conserva-cupo" });
    const otherSchedule = await createScheduleForModalityFixture({
      eventId: scenario.event.id,
      modalityId: scenario.catalog.modality.id,
    });
    const [otherCapacity] = await db
      .insert(scheduleCapacities)
      .values({ capacity: 5, groupType: "solo", scheduleId: otherSchedule.id })
      .returning();

    // Bea for Ana: the roster changed and was re-resolved, and still lands on
    // a solo of the same category.
    const preview = await scenario.resolveDraft(
      scenario.draft({ dancerIds: [scenario.bea.id] }),
    );

    expect(preview.scheduleCapacity.options.map((option) => option.id)).toEqual(
      expect.arrayContaining([
        scenario.catalog.soloScheduleCapacity.id,
        otherCapacity.id,
      ]),
    );
    expect(preview.scheduleCapacity.selectedId).toBe(
      scenario.catalog.soloScheduleCapacity.id,
    );
    expect(preview.consequences.scheduleCapacity).toBeNull();
  });

  // A modality run as two shows, one per category: whatever the roster
  // resolves to decides the show, and the capacity follows it rather than the
  // one the choreography held.
  test("places a re-resolved roster in the show that accepts its category", async () => {
    const scenario = await createDraftScenario({ slug: "dos-funciones" });
    const [secondShow] = await db
      .insert(schedules)
      .values({
        eventId: scenario.event.id,
        name: `Función 2 ${scenario.event.id}`,
        scheduledDate: "2026-05-01",
        startTime: "16:00",
        totalCapacity: 10,
      })
      .returning();
    await db.insert(scheduleModalities).values({
      modalityId: scenario.catalog.modality.id,
      scheduleId: secondShow.id,
    });
    const [secondShowSoloCapacity] = await db
      .insert(scheduleCapacities)
      .values({ capacity: 5, groupType: "solo", scheduleId: secondShow.id })
      .returning();
    await db.insert(scheduleCategories).values([
      {
        categoryId: scenario.catalog.childCategory.id,
        scheduleId: scenario.catalog.schedule.id,
      },
      {
        categoryId: scenario.catalog.teenCategory.id,
        scheduleId: secondShow.id,
      },
    ]);
    const child = await createDancer(scenario.owner.academyId, {
      birthDate: "2018-05-01",
      firstName: "Cora",
      lastName: "Nena",
    });

    const children = await scenario.resolveDraft(
      scenario.draft({ dancerIds: [child.id] }),
    );
    const teenagers = await scenario.resolveDraft(
      scenario.draft({ dancerIds: [scenario.bea.id] }),
    );

    expect(children.category?.id).toBe(scenario.catalog.childCategory.id);
    expect(children.scheduleCapacity.selectedId).toBe(
      scenario.catalog.soloScheduleCapacity.id,
    );
    expect(teenagers.category?.id).toBe(scenario.catalog.teenCategory.id);
    expect(teenagers.scheduleCapacity.selectedId).toBe(
      secondShowSoloCapacity.id,
    );
  });

  test("reports no compatible category as a blocker with its reason", async () => {
    const scenario = await createDraftScenario({ slug: "sin-categoria" });
    const grupalOnly = await createGrupalOnlyModalityFixture(scenario.event.id);

    const preview = await scenario.resolveDraft(
      scenario.draft({ modalityId: grupalOnly.modality.id, submodalityId: "" }),
    );

    expect(preview.category).toBeNull();
    expect(preview.blockers).toContainEqual({
      code: "category",
      message: noCompatibleCategoryModalityMessage,
    });
  });

  test("names the removed dancers whose inscription holds money", async () => {
    const scenario = await createDraftScenario({
      allocatedAmount: 3000,
      slug: "retira",
    });

    const preview = await scenario.resolveDraft(
      scenario.draft({ dancerIds: [scenario.bea.id] }),
    );

    expect(preview.consequences.withdrawnDancers).toEqual([
      { id: scenario.ana.id, name: "Ana Uno" },
    ]);
    await expect(scenario.readActiveDancerIds()).resolves.toEqual([
      scenario.ana.id,
    ]);
  });

  test("answers an evaluated choreography with its structure locked", async () => {
    const scenario = await createDraftScenario({ slug: "evaluada" });
    evaluatedChoreographyIds.add(scenario.choreography.id);

    const preview = await scenario.resolveDraft(
      scenario.draft({ dancerIds: [scenario.ana.id, scenario.bea.id] }),
    );

    expect(preview.structuralLock).toBe(evaluatedChoreographyMessage);
    expect(preview.groupType).toBe("solo");
    expect(preview.category?.id).toBe(scenario.catalog.teenCategory.id);
  });
});

describe("saving a draft of the choreography detail", () => {
  test("writes the name, roster, professors, modality, submodality, level and capacity together", async () => {
    const scenario = await createDraftScenario({ slug: "todo-junto" });
    const target = await createTargetModality(scenario.event.id, {
      levels: ["amateur"],
      withSubmodality: true,
    });
    const professor = await createProfessor(scenario.owner.academyId);

    const response = await scenario.saveDraft(
      scenario.draft({
        dancerIds: [scenario.ana.id, scenario.bea.id],
        experienceLevelId: "amateur",
        modalityId: target.modality.id,
        name: "Nuevo nombre",
        professorIds: [professor.id],
        scheduleCapacityId: target.duoCapacity.id,
        submodalityId: target.submodality?.id ?? "",
      }),
    );

    expect(response).toMatchObject({ status: "success" });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      categoryId: target.category.id,
      experienceLevelId: "amateur",
      groupType: "duo",
      modalityId: target.modality.id,
      name: "Nuevo nombre",
      scheduleCapacityId: target.duoCapacity.id,
      scheduleId: target.schedule.id,
      submodalityId: target.submodality?.id,
    });
    await expect(scenario.readActiveDancerIds()).resolves.toEqual(
      expect.arrayContaining([scenario.ana.id, scenario.bea.id]),
    );
    await expect(scenario.readProfessorIds()).resolves.toEqual([professor.id]);
  });

  test("writes nothing at all when any part of the draft is refused", async () => {
    const scenario = await createDraftScenario({ slug: "nada-parcial" });
    const target = await createTargetModality(scenario.event.id, {
      levels: ["amateur"],
      withSubmodality: true,
    });
    const professor = await createProfessor(scenario.owner.academyId);
    const before = await scenario.readChoreography();

    // Everything valid but the level the new category requires.
    const response = await scenario.saveDraft(
      scenario.draft({
        dancerIds: [scenario.ana.id, scenario.bea.id],
        experienceLevelId: "",
        modalityId: target.modality.id,
        name: "Nuevo nombre",
        professorIds: [professor.id],
        scheduleCapacityId: target.duoCapacity.id,
        submodalityId: target.submodality?.id ?? "",
      }),
    );

    expect(response).toMatchObject({ status: "error" });
    await expect(scenario.readChoreography()).resolves.toEqual(before);
    await expect(scenario.readActiveDancerIds()).resolves.toEqual([
      scenario.ana.id,
    ]);
    await expect(scenario.readProfessorIds()).resolves.toEqual([]);
  });

  test("refuses a draft whose outcome no longer matches the preview", async () => {
    const scenario = await createDraftScenario({ slug: "diverge" });

    const response = await scenario.submit(
      toChoreographyDraftFormData({
        draft: scenario.draft({
          dancerIds: [scenario.ana.id, scenario.bea.id],
          scheduleCapacityId: scenario.catalog.duoScheduleCapacity.id,
        }),
        intent: saveChoreographyDraftIntent,
        previewedCategoryId: scenario.catalog.childCategory.id,
      }),
    );

    expect(response).toMatchObject({
      message: expect.stringContaining("La resolución cambió"),
      status: "error",
    });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      groupType: "solo",
    });
  });

  test("refuses a full destination capacity, and never calls the held one full", async () => {
    const scenario = await createDraftScenario({ slug: "lleno" });
    await db
      .update(scheduleCapacities)
      .set({ capacity: 1 })
      .where(
        eq(scheduleCapacities.id, scenario.catalog.soloScheduleCapacity.id),
      );
    await db
      .update(scheduleCapacities)
      .set({ capacity: 0 })
      .where(
        eq(scheduleCapacities.id, scenario.catalog.duoScheduleCapacity.id),
      );

    const toFull = await scenario.saveDraft(
      scenario.draft({
        dancerIds: [scenario.ana.id, scenario.bea.id],
        scheduleCapacityId: scenario.catalog.duoScheduleCapacity.id,
      }),
    );
    const stayingPut = await scenario.saveDraft(
      scenario.draft({ dancerIds: [scenario.bea.id] }),
    );

    expect(toFull).toMatchObject({ status: "error" });
    expect(stayingPut).toMatchObject({ status: "success" });
    await expect(scenario.readActiveDancerIds()).resolves.toEqual([
      scenario.bea.id,
    ]);
  });

  test("refuses a schedule move that would reprice paid money, with one message whatever caused it", async () => {
    const scenario = await createDraftScenario({
      allocatedAmount: 3000,
      slug: "precio",
    });
    const target = await createTargetModality(scenario.event.id, {
      soloPrice: 20000,
    });
    const otherSchedule = await createScheduleForModalityFixture({
      eventId: scenario.event.id,
      modalityId: scenario.catalog.modality.id,
    });
    const [otherCapacity] = await db
      .insert(scheduleCapacities)
      .values({ capacity: 5, groupType: "solo", scheduleId: otherSchedule.id })
      .returning();
    await db.insert(prices).values({
      amount: 30000,
      eventId: scenario.event.id,
      groupType: "solo",
      name: "Precio Solo otro bloque",
      paymentDeadline: null,
      scheduleId: otherSchedule.id,
    });

    const byModality = await scenario.saveDraft(
      scenario.draft({
        modalityId: target.modality.id,
        scheduleCapacityId: target.soloCapacity.id,
        submodalityId: "",
      }),
    );
    const byCapacity = await scenario.saveDraft(
      scenario.draft({ scheduleCapacityId: otherCapacity.id }),
    );

    expect(byModality).toEqual({
      message: priceDivergenceScheduleCapacityMessage,
      status: "error",
    });
    expect(byCapacity).toEqual({
      message: priceDivergenceScheduleCapacityMessage,
      status: "error",
    });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      modalityId: scenario.catalog.modality.id,
      scheduleCapacityId: scenario.catalog.soloScheduleCapacity.id,
    });
  });

  test("saves a roster change that only moves the group type on a paid choreography", async () => {
    const scenario = await createDraftScenario({
      allocatedAmount: 3000,
      onScheduleTotal: true,
      slug: "tipo-de-grupo",
    });

    const response = await scenario.saveDraft(
      scenario.draft({ dancerIds: [scenario.ana.id, scenario.bea.id] }),
    );

    expect(response).toMatchObject({ status: "success" });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      groupType: "duo",
      scheduleCapacityId: null,
    });
  });

  test("withdraws a removed dancer holding money, deletes one without, and revives one re-added", async () => {
    const scenario = await createDraftScenario({
      allocatedAmount: 3000,
      slug: "retira-revive",
    });
    const [anaInscription] = await scenario.readInscriptions();

    await scenario.saveDraft(scenario.draft({ dancerIds: [scenario.bea.id] }));

    await expect(scenario.readInscriptions()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dancerId: scenario.ana.id,
          id: anaInscription?.id,
          withdrawnAt: expect.any(Date),
        }),
        expect.objectContaining({
          dancerId: scenario.bea.id,
          withdrawnAt: null,
        }),
      ]),
    );

    await scenario.saveDraft(scenario.draft({ dancerIds: [scenario.ana.id] }));

    await expect(scenario.readInscriptions()).resolves.toEqual([
      expect.objectContaining({
        dancerId: scenario.ana.id,
        id: anaInscription?.id,
        withdrawnAt: null,
      }),
    ]);
  });

  // #1050: a save that does not re-resolve the roster still leaves no active
  // inscription carrying a stale age, and moves no placement doing it.
  test("normalizes a stale stored age on a save that does not re-resolve the roster", async () => {
    const scenario = await createDraftScenario({ slug: "edad-vieja" });
    await db
      .update(choreographyDancers)
      .set({ ageAtEventStart: 3 })
      .where(eq(choreographyDancers.choreographyId, scenario.choreography.id));

    const response = await scenario.saveDraft(
      scenario.draft({ name: "Otro nombre" }),
    );

    expect(response).toMatchObject({ status: "success" });
    await expect(scenario.readInscriptions()).resolves.toEqual([
      expect.objectContaining({
        ageAtEventStart: getAgeAtDate(
          scenario.ana.birthDate,
          getEventLocalDateParts(scenario.event.startsAt),
        ),
      }),
    ]);
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      categoryId: scenario.catalog.teenCategory.id,
      groupType: "solo",
    });
  });

  test("refuses structural changes on an evaluated choreography and accepts a rename", async () => {
    const scenario = await createDraftScenario({ slug: "evaluada-guarda" });
    evaluatedChoreographyIds.add(scenario.choreography.id);

    const structural = await scenario.saveDraft(
      scenario.draft({ dancerIds: [scenario.ana.id, scenario.bea.id] }),
    );
    const rename = await scenario.saveDraft(
      scenario.draft({ name: "Otro nombre" }),
    );

    expect(structural).toEqual({
      message: evaluatedChoreographyMessage,
      status: "error",
    });
    expect(rename).toMatchObject({ status: "success" });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      groupType: "solo",
      name: "Otro nombre",
    });
  });
});

async function createDraftScenario(input: {
  allocatedAmount?: number;
  /** On the schedule's total instead of a capacity for its group type. */
  onScheduleTotal?: boolean;
  slug: string;
}) {
  // Every signed request creates its own user, so each one needs a distinct
  // email.
  let requestCount = 0;
  const nextEmail = () =>
    `admin.coreografias.borrador.${input.slug}.${(requestCount += 1)}@example.com`;
  const event = await createEventRecord({ active: true, name: "Regional" });
  const catalog = await createEventCatalog(event.id);
  const owner = await createAcademySession({
    academyName: `Academia ${input.slug}`,
    email: `academia.borrador.${input.slug}@example.com`,
  });
  const [ana, bea] = await Promise.all([
    createDancer(owner.academyId, { firstName: "Ana", lastName: "Uno" }),
    createDancer(owner.academyId, { firstName: "Bea", lastName: "Dos" }),
  ]);
  const totalSchedule = input.onScheduleTotal
    ? await createScheduleForModalityFixture({
        eventId: event.id,
        modalityId: catalog.modality.id,
      })
    : null;
  const choreography = await createChoreographyRecord({
    academyId: owner.academyId,
    categoryId: catalog.teenCategory.id,
    eventId: event.id,
    groupType: "solo",
    modalityId: catalog.modality.id,
    name: "Borrador",
    scheduleCapacityId: totalSchedule ? null : catalog.soloScheduleCapacity.id,
    scheduleId: totalSchedule?.id,
    submodalityId: catalog.submodality.id,
  });
  const heldCapacityId = totalSchedule
    ? getGlobalScheduleCapacityOptionId(totalSchedule.id)
    : catalog.soloScheduleCapacity.id;
  await createSelectedPriceInscriptionForTest({
    academyId: owner.academyId,
    allocatedAmount: input.allocatedAmount,
    choreographyId: choreography.id,
    dancerId: ana.id,
    eventId: event.id,
  });

  async function submit(body: FormData) {
    const { request } = await createSignedInAdminRequest({
      body,
      email: nextEmail(),
      requestUrl: `http://localhost/administracion/coreografias/${choreography.id}`,
      role: "admin",
    });

    return await handleChoreographyDetailAction({
      params: { choreographyId: choreography.id },
      request,
    });
  }

  return {
    ana,
    bea,
    catalog,
    choreography,
    event,
    owner,
    /** The saved choreography as a draft, with the fields a test changes. */
    draft(overrides: Partial<ChoreographyDraft> = {}): ChoreographyDraft {
      return {
        dancerIds: [ana.id],
        experienceLevelId: "",
        modalityId: catalog.modality.id,
        name: choreography.name,
        professorIds: [],
        scheduleCapacityId: heldCapacityId,
        submodalityId: catalog.submodality.id,
        ...overrides,
      };
    },
    async readActiveDancerIds() {
      const rows = await db
        .select({ dancerId: choreographyDancers.dancerId })
        .from(choreographyDancers)
        .where(
          and(
            eq(choreographyDancers.choreographyId, choreography.id),
            isNull(choreographyDancers.withdrawnAt),
          ),
        );

      return rows.map((row) => row.dancerId);
    },
    async readInscriptions() {
      return await db
        .select({
          ageAtEventStart: choreographyDancers.ageAtEventStart,
          dancerId: choreographyDancers.dancerId,
          id: choreographyDancers.id,
          withdrawnAt: choreographyDancers.withdrawnAt,
        })
        .from(choreographyDancers)
        .where(eq(choreographyDancers.choreographyId, choreography.id));
    },
    async readProfessorIds() {
      const rows = await db
        .select({ professorId: choreographyProfessors.professorId })
        .from(choreographyProfessors)
        .where(eq(choreographyProfessors.choreographyId, choreography.id));

      return rows.map((row) => row.professorId);
    },
    async readChoreography() {
      return await db.query.choreographies.findFirst({
        where: eq(choreographies.id, choreography.id),
      });
    },
    async resolveDraft(draft: ChoreographyDraft) {
      return readDraftPreview(
        await submit(
          toChoreographyDraftFormData({
            draft,
            intent: resolveChoreographyDraftIntent,
          }),
        ),
      );
    },
    async saveDraft(draft: ChoreographyDraft) {
      const preview = await this.resolveDraft(draft);

      return await submit(
        toChoreographyDraftFormData({
          draft,
          intent: saveChoreographyDraftIntent,
          previewedCategoryId: preview.category?.id ?? null,
        }),
      );
    },
    submit,
  };
}

/**
 * A second modality whose one category takes every group type from 13 up, on
 * a schedule of its own with a solo and a duo capacity.
 */
async function createTargetModality(
  eventId: string,
  options: {
    levels?: ExperienceLevel[];
    /** A solo price of the target schedule's own, dearer than the general one. */
    soloPrice?: number;
    withSubmodality?: boolean;
  } = {},
) {
  const levels = options.levels ?? [];
  const [modality] = await db
    .insert(modalities)
    .values({ eventId, name: `Urbano ${eventId}` })
    .returning();
  const [submodality] = options.withSubmodality
    ? await db
        .insert(submodalities)
        .values({
          eventId,
          modalityId: modality.id,
          name: `Hip hop ${eventId}`,
        })
        .returning()
    : [null];
  const [category] = await db
    .insert(categories)
    .values({
      eventId,
      experienceLevelKey: levels.join("|"),
      experienceLevels: levels,
      groupTypeKey: "duo|solo",
      groupTypes: ["solo", "duo"],
      maxAge: 100,
      minAge: 1,
      name: `Urbano libre ${eventId}`,
    })
    .returning();
  await db
    .insert(categoryModalities)
    .values({ categoryId: category.id, modalityId: modality.id });
  const schedule = await createScheduleForModalityFixture({
    eventId,
    modalityId: modality.id,
  });
  const [soloCapacity, duoCapacity] = await db
    .insert(scheduleCapacities)
    .values([
      { capacity: 5, groupType: "solo", scheduleId: schedule.id },
      { capacity: 5, groupType: "duo", scheduleId: schedule.id },
    ])
    .returning();

  if (options.soloPrice) {
    await db.insert(prices).values({
      amount: options.soloPrice,
      eventId,
      groupType: "solo",
      name: `Precio Solo ${eventId}`,
      paymentDeadline: null,
      scheduleId: schedule.id,
    });
  }

  return {
    category,
    duoCapacity,
    modality,
    schedule,
    soloCapacity,
    submodality,
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
