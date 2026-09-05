import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  categories,
  categoryModalities,
  choreographies,
  modalities,
  prices,
  scheduleCapacities,
  scheduleModalities,
  submodalities,
} from "@/db/schema";
import {
  handleChoreographyDetailAction,
  loadChoreographyDetailRouteData,
  type ChoreographyDetailActionData,
} from "@/features/admin/choreographies/detail/server";
import {
  modalityFieldNames,
  resolveChoreographyModalityIntent,
  updateChoreographyModalityIntent,
} from "@/features/admin/choreographies/detail/shared";
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
import { createScheduleForModalityFixture } from "@/lib/choreographies/registration-test-fixtures.server.db";
import type { ExperienceLevel } from "@/lib/events/experience-levels";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

describe("administrative choreography modality correction", () => {
  test("previews the destination modality without writing anything", async () => {
    const scenario = await createModalityScenario({ slug: "preview" });

    const response = await scenario.resolveModality(
      scenario.target.modality.id,
    );

    expect(response).toMatchObject({
      intent: resolveChoreographyModalityIntent,
      result: {
        ok: true,
        resolution: {
          category: { name: scenario.target.category.name },
          experienceLevel: { required: false },
          modalityId: scenario.target.modality.id,
          scheduleCapacity: { status: "auto" },
          submodality: { required: true },
        },
      },
    });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      modalityId: scenario.catalog.modality.id,
      submodalityId: scenario.catalog.submodality.id,
    });
  });

  test("writes modality, submodality, category, level and capacity in one correction", async () => {
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
      [modalityFieldNames.submodalityId]: scenario.catalog.submodality.id,
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
      [modalityFieldNames.submodalityId]: "",
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
      { [modalityFieldNames.experienceLevelId]: "" },
    );

    expect(missingLevel).toMatchObject({ status: "error" });

    const response = await scenario.saveModality(scenario.target.modality.id);

    expect(response).toMatchObject({ status: "success" });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      categoryId: scenario.target.category.id,
      experienceLevelId: "profesional",
    });
  });

  test("saves incomplete when no category resolves for the destination modality", async () => {
    const scenario = await createModalityScenario({
      slug: "sin-categoria",
      targetCategoryMaxAge: 12,
      targetCategoryMinAge: 8,
    });

    const response = await scenario.saveModality(scenario.target.modality.id);

    expect(response).toMatchObject({ status: "success" });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      categoryId: null,
      experienceLevelId: null,
      modalityId: scenario.target.modality.id,
    });

    const detail = await scenario.loadDetail();

    expect(detail.choreography.operationalStatus.code).not.toBe("complete");
  });

  test("moves the capacity when the current one stops being compatible", async () => {
    const scenario = await createModalityScenario({ slug: "cupo" });

    await scenario.saveModality(scenario.target.modality.id);

    await expect(scenario.readChoreography()).resolves.toMatchObject({
      scheduleCapacityId: scenario.target.scheduleCapacity.id,
      scheduleId: scenario.target.schedule.id,
    });
  });

  test("rejects the correction when a deposit is registered and the capacity would move", async () => {
    const scenario = await createModalityScenario({
      allocatedAmount: 5000,
      slug: "sena-mueve",
    });

    const response = await scenario.saveModality(scenario.target.modality.id);

    expect(response).toMatchObject({
      message:
        "No se puede cambiar la modalidad: el cronograma se movería y cambiaría el precio de inscripciones con dinero asignado.",
      status: "error",
    });
    await expect(scenario.readChoreography()).resolves.toMatchObject({
      modalityId: scenario.catalog.modality.id,
    });
  });

  // The dead end the omission creates: the modality select stays structural, so
  // this modality is offered, and every capacity behind it would reprice.
  test("previews no capacity at all when every one of them would reprice", async () => {
    const scenario = await createModalityScenario({
      allocatedAmount: 5000,
      slug: "sena-sin-cupo",
    });

    const preview = readModalityResolution(
      await scenario.resolveModality(scenario.target.modality.id),
    );

    expect(preview?.scheduleCapacity).toEqual({ options: [], status: "none" });
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

  test("rejects the correction when the previewed resolution diverged", async () => {
    const scenario = await createModalityScenario({ slug: "divergencia" });

    const response = await scenario.saveModality(scenario.target.modality.id, {
      [modalityFieldNames.previewedCategoryId]:
        scenario.catalog.categoryWithLevel.id,
    });

    expect(response).toMatchObject({
      message:
        "La resolución cambió mientras corregías la modalidad. Revisá los campos y volvé a guardar.",
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

  test("hard-locks the correction once the choreography has a presentation", async () => {
    const scenario = await createModalityScenario({
      hasPresentation: true,
      slug: "presentacion",
    });

    const detail = await scenario.loadDetail();

    expect(detail.modality.canCorrect).toBe(false);

    const response = await scenario.saveModality(scenario.target.modality.id);

    expect(response).toMatchObject({
      message:
        "No se puede cambiar la modalidad: la coreografía ya tiene presentación.",
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

    expect(detail.modality.canCorrect).toBe(true);
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

  test("keeps the correction read-only for auditors", async () => {
    const scenario = await createModalityScenario({ slug: "auditor" });

    const detail = await scenario.loadDetail("auditor");

    expect(detail.modality.canCorrect).toBe(false);
    await expectThrownResponse(
      scenario.saveModality(scenario.target.modality.id, {}, "auditor"),
      403,
    );
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
  hasPresentation?: boolean;
  slug: string;
  targetCategoryLevels?: ExperienceLevel[];
  targetCategoryMaxAge?: number;
  targetCategoryMinAge?: number;
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
    hasPresentation: input.hasPresentation ?? false,
    modalityId: catalog.modality.id,
    name: "Con modalidad",
    scheduleCapacityId: catalog.scheduleCapacity.id,
    submodalityId: catalog.submodality.id,
  });
  // Deadline-less rows, so they are the ones that apply whatever day the suite
  // runs on, and the destination schedule carries a dearer one: with money on
  // the choreography, moving the schedule is what changes the price.
  await db.insert(prices).values([
    {
      amount: 10000,
      eventId: event.id,
      groupType: "solo",
      name: `Precio Solo ${input.slug}`,
      paymentDeadline: null,
      scheduleId: null,
    },
    {
      amount: 20000,
      eventId: event.id,
      groupType: "solo",
      name: `Precio Solo destino ${input.slug}`,
      paymentDeadline: null,
      scheduleId: target.schedule.id,
    },
  ]);
  await createSelectedPriceInscriptionForTest({
    academyId: owner.academyId,
    allocatedAmount: input.allocatedAmount,
    choreographyId: choreography.id,
    eventId: event.id,
  });

  async function resolveModality(
    modalityId: string,
    role: "admin" | "auditor" = "admin",
  ) {
    const formData = new FormData();
    formData.set("intent", resolveChoreographyModalityIntent);
    formData.set(modalityFieldNames.modalityId, modalityId);

    return await submitDetailAction({
      body: formData,
      choreographyId: choreography.id,
      email: nextEmail(role),
      role,
    });
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
        requestUrl: `http://localhost/administracion/coreografias/${choreography.id}`,
        role,
      });

      return await loadChoreographyDetailRouteData({
        params: { choreographyId: choreography.id },
        request,
      });
    },
    async readChoreography() {
      return await db.query.choreographies.findFirst({
        where: eq(choreographies.id, choreography.id),
      });
    },
    resolveModality,
    /**
     * Saves the correction with the fields the view would have filled from the
     * fetcher's resolution, so each test overrides only the one it exercises.
     *
     * The five `?? ""` fallbacks are the whole cyclomatic count, and the CRAP
     * score on top of them penalises coverage a fixture cannot have: every test
     * in this file runs it, and nothing tests the test.
     */
    // fallow-ignore-next-line complexity
    async saveModality(
      modalityId: string,
      overrides: Record<string, string> = {},
      role: "admin" | "auditor" = "admin",
    ) {
      const preview = readModalityResolution(await resolveModality(modalityId));
      const formData = new FormData();
      formData.set("intent", updateChoreographyModalityIntent);
      formData.set(modalityFieldNames.modalityId, modalityId);
      formData.set(
        modalityFieldNames.previewedCategoryId,
        preview?.category?.id ?? "",
      );
      formData.set(
        modalityFieldNames.submodalityId,
        preview?.submodality.options[0]?.id ?? "",
      );
      formData.set(
        modalityFieldNames.experienceLevelId,
        preview?.experienceLevel.options[0]?.id ?? "",
      );
      formData.set(
        modalityFieldNames.scheduleCapacityId,
        preview?.scheduleCapacity.options[0]?.id ?? "",
      );

      for (const [key, value] of Object.entries(overrides)) {
        formData.set(key, value);
      }

      return await submitDetailAction({
        body: formData,
        choreographyId: choreography.id,
        email: nextEmail(role),
        role,
      });
    },
    target,
  };
}

function readModalityResolution(
  response: ChoreographyDetailActionData | Response,
) {
  if (
    response instanceof Response ||
    !("intent" in response) ||
    response.intent !== resolveChoreographyModalityIntent ||
    !response.result.ok
  ) {
    return null;
  }

  return response.result.resolution;
}

async function createTargetModality(input: {
  categoryLevels: ExperienceLevel[];
  categoryMaxAge: number;
  categoryMinAge: number;
  eventId: string;
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

  return { category, modality, schedule, scheduleCapacity, submodality };
}

async function submitDetailAction(input: {
  body: FormData;
  choreographyId: string;
  email: string;
  role: "admin" | "auditor";
}) {
  const { request } = await createSignedInAdminRequest({
    body: input.body,
    email: input.email,
    requestUrl: `http://localhost/administracion/coreografias/${input.choreographyId}`,
    role: input.role,
  });

  return await handleChoreographyDetailAction({
    params: { choreographyId: input.choreographyId },
    request,
  });
}
