import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import {
  categories,
  categoryModalities,
  choreographies,
  choreographyDancers,
  events,
  modalities,
  prices,
  scheduleCapacities,
  scheduleCategories,
  scheduleModalities,
  schedules,
  dancers,
} from "@/db/schema";
import {
  applyDancerBirthDateCorrection,
  buildDancerBirthDateCorrectionRefusalMessage,
  loadLinkedChoreographyEventBasesForDancerBirthDateCorrection,
  recalculateLinkedChoreographiesForDancerBirthDateCorrection,
  runDancerWriteWithBirthDateCorrection,
  type DancerBirthDateCorrectionResult,
} from "@/lib/choreographies/dancer-birthdate-correction.server";
import { buildDancerBirthDateScheduleMoveMessages } from "@/lib/choreographies/dancer-birthdate-messages";
import { createAcademySession } from "@/lib/choreographies/registration-test-fixtures.server.db";
import {
  experienceLevelLabels,
  isExperienceLevel,
} from "@/lib/events/experience-levels";
import {
  allocateChoreographyNumberForTest,
  readFixtureCapacityScheduleId,
} from "@/lib/choreographies/registration-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";
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

describe("dancer birth date choreography correction", () => {
  test("recalculates eligible linked choreographies, preserves or clears level, and skips presented records", async () => {
    const academy = await createAcademySession({
      academyName: "Academia Correcciones",
      email: "admin.birthdate.corrections@example.com",
    });
    const correctedDancer = await createDancer(academy.academyId, {
      firstName: "Nina",
      lastName: "Corrección",
      birthDate: "2014-05-01",
    });
    const preserveCatalog = await createCorrectionCatalog({
      categoryRequiresLevelOnOlderRange: true,
      eventName: "Preserva nivel",
    });
    const clearCatalog = await createCorrectionCatalog({
      categoryRequiresLevelOnOlderRange: false,
      eventName: "Limpia nivel",
    });
    const presentedCatalog = await createCorrectionCatalog({
      categoryRequiresLevelOnOlderRange: true,
      eventName: "Presentada",
    });

    const preserveChoreography = await createLinkedChoreography({
      academyId: academy.academyId,
      categoryId: preserveCatalog.youngerCategory.id,
      eventId: preserveCatalog.event.id,
      experienceLevelId: preserveCatalog.level.id,
      modalityId: preserveCatalog.modality.id,
      name: "Preserva",
      scheduleCapacityId: preserveCatalog.scheduleCapacity.id,
    });
    const clearChoreography = await createLinkedChoreography({
      academyId: academy.academyId,
      categoryId: clearCatalog.youngerCategory.id,
      eventId: clearCatalog.event.id,
      experienceLevelId: clearCatalog.level.id,
      modalityId: clearCatalog.modality.id,
      name: "Limpia",
      scheduleCapacityId: clearCatalog.scheduleCapacity.id,
    });
    const presentedChoreography = await createLinkedChoreography({
      academyId: academy.academyId,
      categoryId: presentedCatalog.youngerCategory.id,
      eventId: presentedCatalog.event.id,
      experienceLevelId: presentedCatalog.level.id,
      isEvaluated: true,
      modalityId: presentedCatalog.modality.id,
      name: "Presentada",
      scheduleCapacityId: presentedCatalog.scheduleCapacity.id,
    });

    await db.insert(choreographyDancers).values([
      {
        choreographyId: preserveChoreography.id,
        dancerId: correctedDancer.id,
        ageAtEventStart: 12,
      },
      {
        choreographyId: clearChoreography.id,
        dancerId: correctedDancer.id,
        ageAtEventStart: 12,
      },
      {
        choreographyId: presentedChoreography.id,
        dancerId: correctedDancer.id,
        ageAtEventStart: 12,
      },
    ]);

    await db
      .update(dancers)
      .set({ birthDate: "2011-05-01" })
      .where(eq(dancers.id, correctedDancer.id));

    const result = await recalculateInTransaction(correctedDancer.id);

    expect(result).toEqual({
      ok: true,
      scheduleMoves: [],
      recategorisedChoreographies: [
        {
          choreographyId: preserveChoreography.id,
          name: "Preserva",
          categoryName: "Preserva nivel Mayor",
          experienceLevelCleared: false,
        },
        {
          choreographyId: clearChoreography.id,
          name: "Limpia",
          categoryName: "Limpia nivel Mayor",
          experienceLevelCleared: true,
        },
      ],
    });
    await expectChoreographyUpdatedAtChanged(preserveChoreography);
    await expectChoreographyUpdatedAtChanged(clearChoreography);
    await expectChoreographyState(preserveChoreography.id, {
      categoryId: preserveCatalog.olderCategory?.id ?? null,
      categoryCalculationMode: "oldest",
      categoryAgeBasis: 15,
      experienceLevelId: preserveCatalog.level.id,
    });
    await expectChoreographyState(clearChoreography.id, {
      categoryId: clearCatalog.olderCategory?.id ?? null,
      categoryCalculationMode: "oldest",
      categoryAgeBasis: 15,
      experienceLevelId: null,
    });
    await expectChoreographyState(presentedChoreography.id, {
      categoryId: presentedCatalog.youngerCategory.id,
      categoryCalculationMode: "oldest",
      categoryAgeBasis: 12,
      experienceLevelId: presentedCatalog.level.id,
    });

    await expectDancerAgeLink(preserveChoreography.id, correctedDancer.id, 15);
    await expectDancerAgeLink(clearChoreography.id, correctedDancer.id, 15);
    await expectDancerAgeLink(presentedChoreography.id, correctedDancer.id, 12);
  });

  test("refuses a correction that would leave the solo without a category", async () => {
    const academy = await createAcademySession({
      academyName: "Academia Cero",
      email: "admin.birthdate.zero@example.com",
    });
    const correctedDancer = await createDancer(academy.academyId, {
      firstName: "Cero",
      lastName: "Corrección",
      birthDate: "2016-04-10",
    });
    const catalog = await createCorrectionCatalog({
      categoryRequiresLevelOnOlderRange: false,
      eventName: "Edad cero",
    });
    const choreography = await createLinkedChoreography({
      academyId: academy.academyId,
      categoryId: catalog.youngerCategory.id,
      categoryAgeBasis: 10,
      eventId: catalog.event.id,
      experienceLevelId: null,
      modalityId: catalog.modality.id,
      name: "Solo sin repuesto",
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });

    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: correctedDancer.id,
      ageAtEventStart: 10,
    });

    // The defect the refusal now blocks: a birth date in the event's own year
    // makes the dancer 0, which no ladder admits.
    await db
      .update(dancers)
      .set({ birthDate: "2026-04-10" })
      .where(eq(dancers.id, correctedDancer.id));

    const result = await recalculateInTransaction(correctedDancer.id);

    expect(result).toEqual({
      ok: false,
      code: "no-compatible-category",
      choreographiesWithoutCategory: [
        {
          choreographyNumber: choreography.choreographyNumber,
          name: "Solo sin repuesto",
        },
      ],
    });
    expect(
      buildDancerBirthDateCorrectionRefusalMessage(
        readChoreographiesWithoutCategory(result),
      ),
    ).toBe(
      `Con esta fecha de nacimiento, la coreografía n.º ${choreography.choreographyNumber} «Solo sin repuesto» queda sin categoría.`,
    );
    await expectChoreographyState(choreography.id, {
      categoryId: catalog.youngerCategory.id,
      categoryCalculationMode: "oldest",
      categoryAgeBasis: 10,
      experienceLevelId: null,
    });
    await expectDancerAgeLink(choreography.id, correctedDancer.id, 10);
  });

  test("names every refused choreography in the plural and writes none of them", async () => {
    const academy = await createAcademySession({
      academyName: "Academia Plural",
      email: "admin.birthdate.plural@example.com",
    });
    const correctedDancer = await createDancer(academy.academyId, {
      firstName: "Plural",
      lastName: "Corrección",
      birthDate: "2016-04-10",
    });
    const catalog = await createCorrectionCatalog({
      categoryRequiresLevelOnOlderRange: false,
      eventName: "Plural",
    });
    const firstChoreography = await createLinkedChoreography({
      academyId: academy.academyId,
      categoryId: catalog.youngerCategory.id,
      categoryAgeBasis: 10,
      eventId: catalog.event.id,
      experienceLevelId: null,
      modalityId: catalog.modality.id,
      name: "Primera",
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });
    const secondChoreography = await createLinkedChoreography({
      academyId: academy.academyId,
      categoryId: catalog.youngerCategory.id,
      categoryAgeBasis: 10,
      eventId: catalog.event.id,
      experienceLevelId: null,
      modalityId: catalog.modality.id,
      name: "Segunda",
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });

    await db.insert(choreographyDancers).values([
      {
        choreographyId: firstChoreography.id,
        dancerId: correctedDancer.id,
        ageAtEventStart: 10,
      },
      {
        choreographyId: secondChoreography.id,
        dancerId: correctedDancer.id,
        ageAtEventStart: 10,
      },
    ]);

    await db
      .update(dancers)
      .set({ birthDate: "2026-04-10" })
      .where(eq(dancers.id, correctedDancer.id));

    const result = await recalculateInTransaction(correctedDancer.id);

    expect(result.ok).toBe(false);
    expect(
      buildDancerBirthDateCorrectionRefusalMessage(
        readChoreographiesWithoutCategory(result),
      ),
    ).toBe(
      `Con esta fecha de nacimiento, las coreografías n.º ${firstChoreography.choreographyNumber} «Primera» y n.º ${secondChoreography.choreographyNumber} «Segunda» quedan sin categoría.`,
    );
    await expectDancerAgeLink(firstChoreography.id, correctedDancer.id, 10);
    await expectDancerAgeLink(secondChoreography.id, correctedDancer.id, 10);
  });

  // A dancer can sit in more choreographies than a field error can list. The
  // cap belongs to the shared formatter, so the refusal gets it without the
  // caller asking: the sentence names five and counts the rest.
  test("names at most five blocked choreographies and counts the rest", () => {
    const blocked = [1, 2, 3, 4, 5, 6, 7].map((choreographyNumber) => ({
      choreographyNumber,
      name: `Coreografía ${choreographyNumber}`,
    }));

    expect(buildDancerBirthDateCorrectionRefusalMessage(blocked)).toBe(
      "Con esta fecha de nacimiento, las coreografías n.º 1 «Coreografía 1», n.º 2 «Coreografía 2», n.º 3 «Coreografía 3», n.º 4 «Coreografía 4», n.º 5 «Coreografía 5» y 2 más quedan sin categoría.",
    );
  });

  test("re-places a group whose average crosses a band boundary", async () => {
    const academy = await createAcademySession({
      academyName: "Academia Promedio",
      email: "admin.birthdate.average@example.com",
    });
    const catalog = await createCorrectionCatalog({
      categoryRequiresLevelOnOlderRange: false,
      eventName: "Promedio grupal",
      groupType: "grupal",
    });
    const correctedDancer = await createDancer(academy.academyId, {
      firstName: "Carola",
      lastName: "Promedio",
      birthDate: "2026-04-10",
    });
    const companions = await Promise.all(
      ["Una", "Dos", "Tres"].map((ordinal) =>
        createDancer(academy.academyId, {
          firstName: ordinal,
          lastName: "Compañera",
          birthDate: "2012-01-01",
        }),
      ),
    );
    // The quieter half of the defect: the 0 does not block the group, it only
    // drags the average down a band. Ages {0, 14, 14, 14} average to 11.
    const choreography = await createLinkedChoreography({
      academyId: academy.academyId,
      categoryId: catalog.youngerCategory.id,
      categoryAgeBasis: 11,
      categoryCalculationMode: "group_average",
      eventId: catalog.event.id,
      experienceLevelId: null,
      groupType: "grupal",
      modalityId: catalog.modality.id,
      name: "Promedio envenenado",
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });

    await db.insert(choreographyDancers).values([
      {
        choreographyId: choreography.id,
        dancerId: correctedDancer.id,
        ageAtEventStart: 0,
      },
      ...companions.map((companion) => ({
        choreographyId: choreography.id,
        dancerId: companion.id,
        ageAtEventStart: 14,
      })),
    ]);

    await db
      .update(dancers)
      .set({ birthDate: "2018-05-01" })
      .where(eq(dancers.id, correctedDancer.id));

    await recalculateInTransaction(correctedDancer.id);

    // Ages {8, 14, 14, 14} average to 13, one band up.
    await expectChoreographyState(choreography.id, {
      categoryId: catalog.olderCategory?.id ?? null,
      categoryCalculationMode: "group_average",
      categoryAgeBasis: 13,
      experienceLevelId: null,
    });
    await expectDancerAgeLink(choreography.id, correctedDancer.id, 8);
  });
});

async function createCorrectionCatalog(input: {
  eventName: string;
  categoryRequiresLevelOnOlderRange: boolean;
  includeOlderCategory?: boolean;
  groupType?: "solo" | "grupal";
}) {
  const groupType = input.groupType ?? "solo";
  await db.update(events).set({ active: false }).where(eq(events.active, true));

  const [event] = await db
    .insert(events)
    .values({
      name: input.eventName,
      active: true,
      programVisible: false,
      requiredDepositPercentage: 30,
      startsAt: new Date("2026-05-01T12:00:00Z"),
      endsAt: new Date("2026-05-03T12:00:00Z"),
    })
    .returning();
  const [modality] = await db
    .insert(modalities)
    .values({
      eventId: event.id,
      name: `${input.eventName} Mod`,
    })
    .returning();
  const level = { id: "amateur", name: experienceLevelLabels.amateur } as const;
  const [youngerCategory] = await db
    .insert(categories)
    .values({
      eventId: event.id,
      name: `${input.eventName} Menor`,
      minAge: 8,
      maxAge: 12,
      groupTypes: [groupType],
      groupTypeKey: groupType,
      experienceLevels: [level.id],
      experienceLevelKey: level.id,
    })
    .returning();

  const olderCategory =
    input.includeOlderCategory === false
      ? null
      : (
          await db
            .insert(categories)
            .values({
              eventId: event.id,
              name: `${input.eventName} Mayor`,
              minAge: 13,
              maxAge: 17,
              groupTypes: [groupType],
              groupTypeKey: groupType,
              experienceLevels: input.categoryRequiresLevelOnOlderRange
                ? [level.id]
                : [],
              experienceLevelKey: input.categoryRequiresLevelOnOlderRange
                ? level.id
                : "",
            })
            .returning()
        )[0];

  await db.insert(categoryModalities).values([
    {
      categoryId: youngerCategory.id,
      modalityId: modality.id,
    },
    ...(olderCategory
      ? [
          {
            categoryId: olderCategory.id,
            modalityId: modality.id,
          },
        ]
      : []),
  ]);
  const [schedule] = await db
    .insert(schedules)
    .values({
      eventId: event.id,
      name: `${input.eventName} Bloque`,
      scheduledDate: "2026-05-01",
      startTime: "10:00",
      totalCapacity: 10,
    })
    .returning();
  await db.insert(scheduleModalities).values({
    scheduleId: schedule.id,
    modalityId: modality.id,
  });
  await db.insert(prices).values({
    eventId: event.id,
    name: `${input.eventName} Precio`,
    groupType,
    amount: 10000,
    paymentDeadline: "2026-05-31",
    scheduleId: null,
  });
  const [scheduleCapacity] = await db
    .insert(scheduleCapacities)
    .values({
      scheduleId: schedule.id,
      groupType,
      capacity: 5,
    })
    .returning();

  return {
    event,
    modality,
    level,
    youngerCategory,
    olderCategory,
    scheduleCapacity,
  };
}

function readChoreographiesWithoutCategory(
  result: DancerBirthDateCorrectionResult,
) {
  return result.ok || result.code !== "no-compatible-category"
    ? []
    : result.choreographiesWithoutCategory;
}

async function createDancer(
  academyId: string,
  input: {
    firstName: string;
    lastName: string;
    birthDate: string;
  },
) {
  const [dancer] = await db
    .insert(dancers)
    .values({
      academyId,
      firstName: input.firstName,
      lastName: input.lastName,
      birthDate: input.birthDate,
    })
    .returning();

  return dancer;
}

async function createLinkedChoreography(input: {
  academyId: string;
  eventId: string;
  name: string;
  modalityId: string;
  categoryId: string;
  experienceLevelId: string | null;
  scheduleCapacityId: string;
  isEvaluated?: boolean;
  groupType?: "solo" | "grupal";
  categoryCalculationMode?: "oldest" | "group_average";
  categoryAgeBasis?: number;
}) {
  const choreographyNumber = await allocateChoreographyNumberForTest(
    input.eventId,
  );
  const [choreography] = await db
    .insert(choreographies)
    .values({
      choreographyNumber,
      academyId: input.academyId,
      eventId: input.eventId,
      name: input.name,
      modalityId: input.modalityId,
      submodalityId: null,
      groupType: input.groupType ?? "solo",
      categoryId: input.categoryId,
      categoryCalculationMode: input.categoryCalculationMode ?? "oldest",
      categoryAgeBasis: input.categoryAgeBasis ?? 12,
      experienceLevelId:
        input.experienceLevelId && isExperienceLevel(input.experienceLevelId)
          ? input.experienceLevelId
          : null,
      scheduleId: await readFixtureCapacityScheduleId(input.scheduleCapacityId),
      scheduleCapacityId: input.scheduleCapacityId,
    })
    .returning();

  if (input.isEvaluated) {
    evaluatedChoreographyIds.add(choreography.id);
  }

  return choreography;
}

async function expectChoreographyUpdatedAtChanged(choreography: {
  id: string;
  updatedAt: Date | null;
}) {
  const stored = await db.query.choreographies.findFirst({
    columns: { updatedAt: true },
    where: eq(choreographies.id, choreography.id),
  });

  expect(stored?.updatedAt?.getTime()).toBeGreaterThan(
    choreography.updatedAt?.getTime() ?? 0,
  );
}

async function expectChoreographyState(
  choreographyId: string,
  expected: {
    categoryId: string | null;
    categoryCalculationMode: "oldest" | "group_average";
    categoryAgeBasis: number;
    experienceLevelId: string | null;
  },
) {
  await expect(
    db.query.choreographies.findFirst({
      columns: {
        categoryId: true,
        categoryCalculationMode: true,
        categoryAgeBasis: true,
        experienceLevelId: true,
      },
      where: eq(choreographies.id, choreographyId),
    }),
  ).resolves.toMatchObject(expected);
}

async function expectDancerAgeLink(
  choreographyId: string,
  dancerId: string,
  expectedAge: number,
) {
  await expect(
    db.query.choreographyDancers.findFirst({
      columns: { ageAtEventStart: true },
      where: and(
        eq(choreographyDancers.choreographyId, choreographyId),
        eq(choreographyDancers.dancerId, dancerId),
      ),
    }),
  ).resolves.toMatchObject({ ageAtEventStart: expectedAge });
}

describe("birth date correction schedule move", () => {
  test("leaves the schedule untouched when it still accepts the new category", async () => {
    const scenario = await createScheduleMoveScenario({
      eventName: "Sin división",
      firstShowCategories: "both",
    });

    const write = await correctBirthDate(scenario.dancerId, "2011-05-01");

    expect(write.ok).toBe(true);
    await expectChoreographySchedule(scenario.choreographyId, {
      scheduleId: scenario.firstShow.scheduleId,
      scheduleCapacityId: scenario.firstShow.scheduleCapacityId,
    });
  });

  test("moves the choreography to the only show that accepts its new category", async () => {
    const scenario = await createScheduleMoveScenario({
      eventName: "Dos funciones",
      firstShowCategories: "younger",
      secondShow: { accepts: "older" },
    });

    const write = await correctBirthDate(scenario.dancerId, "2011-05-01");

    expect(write).toMatchObject({ ok: true });
    await expectChoreographySchedule(scenario.choreographyId, {
      scheduleId: scenario.secondShow?.scheduleId ?? null,
      scheduleCapacityId: scenario.secondShow?.scheduleCapacityId ?? null,
    });
  });

  test("reports the choreography that moved and the schedule it moved to", async () => {
    const scenario = await createScheduleMoveScenario({
      eventName: "Informe",
      firstShowCategories: "younger",
      secondShow: { accepts: "older" },
    });

    const moves = await readScheduleMoves(scenario.dancerId, "2011-05-01");

    expect(moves).toEqual([
      {
        choreography: {
          choreographyNumber: scenario.choreographyNumber,
          name: "Coreografía móvil",
        },
        scheduleName: "Informe Función 2",
      },
    ]);
    expect(buildDancerBirthDateScheduleMoveMessages(moves)).toEqual([
      `La coreografía n.º ${scenario.choreographyNumber} «Coreografía móvil» pasó al cronograma Informe Función 2.`,
    ]);
  });

  test("refuses the whole correction when no schedule accepts the new category", async () => {
    const scenario = await createScheduleMoveScenario({
      eventName: "Sin destino",
      firstShowCategories: "younger",
    });

    const write = await correctBirthDate(scenario.dancerId, "2011-05-01");

    expect(write).toEqual({
      ok: false,
      birthDateMessage: `Con esta fecha de nacimiento, la coreografía n.º ${scenario.choreographyNumber} «Coreografía móvil» queda sin cronograma compatible.`,
    });
    await expectChoreographySchedule(scenario.choreographyId, {
      scheduleId: scenario.firstShow.scheduleId,
      scheduleCapacityId: scenario.firstShow.scheduleCapacityId,
    });
    await expectDancerBirthDate(scenario.dancerId, "2016-05-01");
  });

  test("refuses the whole correction when the only compatible show is full", async () => {
    const scenario = await createScheduleMoveScenario({
      eventName: "Función llena",
      firstShowCategories: "younger",
      secondShow: { accepts: "older", totalCapacity: 1, fill: true },
    });

    const write = await correctBirthDate(scenario.dancerId, "2011-05-01");

    expect(write).toMatchObject({ ok: false });
    await expectChoreographySchedule(scenario.choreographyId, {
      scheduleId: scenario.firstShow.scheduleId,
      scheduleCapacityId: scenario.firstShow.scheduleCapacityId,
    });
    await expectDancerBirthDate(scenario.dancerId, "2016-05-01");
  });

  test("refuses the whole correction when the only compatible show cannot take every choreography", async () => {
    const scenario = await createScheduleMoveScenario({
      eventName: "Una sola plaza",
      firstShowCategories: "younger",
      linkedChoreographies: 2,
      secondShow: { accepts: "older", totalCapacity: 1 },
    });

    const write = await correctBirthDate(scenario.dancerId, "2011-05-01");

    expect(write).toMatchObject({ ok: false });

    for (const choreography of scenario.linkedChoreographies) {
      await expectChoreographySchedule(choreography.id, {
        scheduleId: scenario.firstShow.scheduleId,
        scheduleCapacityId: scenario.firstShow.scheduleCapacityId,
      });
    }

    await expectDancerBirthDate(scenario.dancerId, "2016-05-01");
  });

  test("refuses the whole correction when several shows accept the new category", async () => {
    const scenario = await createScheduleMoveScenario({
      eventName: "Dos destinos",
      firstShowCategories: "younger",
      secondShow: { accepts: "older" },
      thirdShow: { accepts: "older" },
    });

    const write = await correctBirthDate(scenario.dancerId, "2011-05-01");

    expect(write).toMatchObject({ ok: false });
    await expectChoreographySchedule(scenario.choreographyId, {
      scheduleId: scenario.firstShow.scheduleId,
      scheduleCapacityId: scenario.firstShow.scheduleCapacityId,
    });
    await expectDancerBirthDate(scenario.dancerId, "2016-05-01");
  });
});

type ShowInput = {
  accepts: "older";
  totalCapacity?: number;
  fill?: boolean;
};

type Show = {
  scheduleId: string;
  scheduleCapacityId: string;
};

/**
 * A modality run as one or two shows, with a choreography whose dancer is
 * about to age out of the younger category. The scenario is described by which
 * categories each show accepts, because that is the only axis these tests vary.
 */
async function createScheduleMoveScenario(input: {
  eventName: string;
  firstShowCategories: "both" | "younger";
  secondShow?: ShowInput;
  thirdShow?: ShowInput;
  linkedChoreographies?: number;
}) {
  const academy = await createAcademySession({
    academyName: `Academia ${input.eventName}`,
    email: `admin.birthdate.${crypto.randomUUID()}@example.com`,
  });
  const catalog = await createCorrectionCatalog({
    categoryRequiresLevelOnOlderRange: false,
    eventName: input.eventName,
  });
  const olderCategoryId = catalog.olderCategory?.id ?? "";
  const firstShowScheduleId = await readFixtureCapacityScheduleId(
    catalog.scheduleCapacity.id,
  );

  await db.insert(scheduleCategories).values([
    {
      scheduleId: firstShowScheduleId,
      categoryId: catalog.youngerCategory.id,
    },
    ...(input.firstShowCategories === "both"
      ? [{ scheduleId: firstShowScheduleId, categoryId: olderCategoryId }]
      : []),
  ]);

  const secondShow = input.secondShow
    ? await createShow({
        academyId: academy.academyId,
        catalog,
        name: `${input.eventName} Función 2`,
        show: input.secondShow,
      })
    : null;
  const thirdShow = input.thirdShow
    ? await createShow({
        academyId: academy.academyId,
        catalog,
        name: `${input.eventName} Función 3`,
        show: input.thirdShow,
      })
    : null;

  const dancer = await createDancer(academy.academyId, {
    firstName: "Móvil",
    lastName: "Corrección",
    birthDate: "2016-05-01",
  });
  const linkedChoreographies = [];

  for (let index = 0; index < (input.linkedChoreographies ?? 1); index += 1) {
    const choreography = await createLinkedChoreography({
      academyId: academy.academyId,
      categoryId: catalog.youngerCategory.id,
      categoryAgeBasis: 10,
      eventId: catalog.event.id,
      experienceLevelId: null,
      modalityId: catalog.modality.id,
      name:
        index === 0 ? "Coreografía móvil" : `Coreografía móvil ${index + 1}`,
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });

    await db.insert(choreographyDancers).values({
      choreographyId: choreography.id,
      dancerId: dancer.id,
      ageAtEventStart: 10,
    });
    linkedChoreographies.push(choreography);
  }

  const [choreography] = linkedChoreographies;

  return {
    choreographyId: choreography.id,
    choreographyNumber: choreography.choreographyNumber,
    linkedChoreographies,
    dancerId: dancer.id,
    firstShow: {
      scheduleId: firstShowScheduleId,
      scheduleCapacityId: catalog.scheduleCapacity.id,
    },
    secondShow,
    thirdShow,
  };
}

async function createShow(input: {
  academyId: string;
  catalog: Awaited<ReturnType<typeof createCorrectionCatalog>>;
  name: string;
  show: ShowInput;
}): Promise<Show> {
  const olderCategoryId = input.catalog.olderCategory?.id ?? "";
  const [schedule] = await db
    .insert(schedules)
    .values({
      eventId: input.catalog.event.id,
      name: input.name,
      scheduledDate: "2026-05-02",
      startTime: "10:00",
      totalCapacity: input.show.totalCapacity ?? 10,
    })
    .returning();

  await db.insert(scheduleModalities).values({
    scheduleId: schedule.id,
    modalityId: input.catalog.modality.id,
  });
  await db.insert(scheduleCategories).values({
    scheduleId: schedule.id,
    categoryId: olderCategoryId,
  });

  const [scheduleCapacity] = await db
    .insert(scheduleCapacities)
    .values({
      scheduleId: schedule.id,
      groupType: "solo",
      capacity: input.show.totalCapacity ?? 5,
    })
    .returning();

  if (input.show.fill) {
    await createLinkedChoreography({
      academyId: input.academyId,
      categoryId: olderCategoryId,
      categoryAgeBasis: 15,
      eventId: input.catalog.event.id,
      experienceLevelId: null,
      modalityId: input.catalog.modality.id,
      name: `${input.name} ocupante`,
      scheduleCapacityId: scheduleCapacity.id,
    });
  }

  return { scheduleId: schedule.id, scheduleCapacityId: scheduleCapacity.id };
}

/**
 * The recalculation on its own, in the transaction it requires: the capacity
 * lock a schedule move takes guards nothing outside one. The bases are loaded
 * before the transaction opens, exactly as both dancer forms do it.
 */
async function recalculateInTransaction(dancerId: string) {
  const eventBasesByEventId =
    await loadLinkedChoreographyEventBasesForDancerBirthDateCorrection({
      dancerId,
    });

  return await db.transaction(
    async (tx) =>
      await recalculateLinkedChoreographiesForDancerBirthDateCorrection({
        dancerId,
        eventBasesByEventId,
        executor: tx,
      }),
  );
}

async function correctBirthDate(dancerId: string, birthDate: string) {
  // The bases are loaded before the transaction opens, exactly as both dancer
  // forms do it.
  const eventBasesByEventId =
    await loadLinkedChoreographyEventBasesForDancerBirthDateCorrection({
      dancerId,
    });

  return await runDancerWriteWithBirthDateCorrection(async (tx) => {
    await tx.update(dancers).set({ birthDate }).where(eq(dancers.id, dancerId));

    return await applyDancerBirthDateCorrection({
      dancerId,
      eventBasesByEventId,
      executor: tx,
    });
  });
}

async function readScheduleMoves(dancerId: string, birthDate: string) {
  const write = await correctBirthDate(dancerId, birthDate);

  if (!write.ok) {
    throw new Error(write.birthDateMessage);
  }

  return write.result.scheduleMoves;
}

async function expectChoreographySchedule(
  choreographyId: string,
  expected: { scheduleId: string | null; scheduleCapacityId: string | null },
) {
  await expect(
    db.query.choreographies.findFirst({
      columns: { scheduleId: true, scheduleCapacityId: true },
      where: eq(choreographies.id, choreographyId),
    }),
  ).resolves.toMatchObject(expected);
}

async function expectDancerBirthDate(dancerId: string, expected: string) {
  await expect(
    db.query.dancers.findFirst({
      columns: { birthDate: true },
      where: eq(dancers.id, dancerId),
    }),
  ).resolves.toMatchObject({ birthDate: expected });
}
