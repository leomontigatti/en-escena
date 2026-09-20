import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

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
  scheduleModalities,
  schedules,
  dancers,
} from "@/db/schema";
import {
  buildDancerBirthDateCorrectionRefusalMessage,
  recalculateLinkedChoreographiesForDancerBirthDateCorrection,
} from "@/lib/choreographies/dancer-birthdate-correction.server";
import { createAcademySession } from "@/lib/choreographies/registration-test-fixtures.server.db";
import {
  experienceLevelLabels,
  isExperienceLevel,
} from "@/lib/events/experience-levels";
import {
  allocateChoreographyNumberForTest,
  readScheduleIdOfCapacityFixture,
} from "@/lib/choreographies/registration-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

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
      hasPresentation: false,
      modalityId: preserveCatalog.modality.id,
      name: "Preserva",
      scheduleCapacityId: preserveCatalog.scheduleCapacity.id,
    });
    const clearChoreography = await createLinkedChoreography({
      academyId: academy.academyId,
      categoryId: clearCatalog.youngerCategory.id,
      eventId: clearCatalog.event.id,
      experienceLevelId: clearCatalog.level.id,
      hasPresentation: false,
      modalityId: clearCatalog.modality.id,
      name: "Limpia",
      scheduleCapacityId: clearCatalog.scheduleCapacity.id,
    });
    const presentedChoreography = await createLinkedChoreography({
      academyId: academy.academyId,
      categoryId: presentedCatalog.youngerCategory.id,
      eventId: presentedCatalog.event.id,
      experienceLevelId: presentedCatalog.level.id,
      hasPresentation: true,
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

    const result =
      await recalculateLinkedChoreographiesForDancerBirthDateCorrection({
        dancerId: correctedDancer.id,
      });

    expect(result).toEqual({ ok: true });
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
      hasPresentation: false,
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

    const result =
      await recalculateLinkedChoreographiesForDancerBirthDateCorrection({
        dancerId: correctedDancer.id,
      });

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
        result.ok ? [] : result.choreographiesWithoutCategory,
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
      hasPresentation: false,
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
      hasPresentation: false,
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

    const result =
      await recalculateLinkedChoreographiesForDancerBirthDateCorrection({
        dancerId: correctedDancer.id,
      });

    expect(result.ok).toBe(false);
    expect(
      buildDancerBirthDateCorrectionRefusalMessage(
        result.ok ? [] : result.choreographiesWithoutCategory,
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
      hasPresentation: false,
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

    await recalculateLinkedChoreographiesForDancerBirthDateCorrection({
      dancerId: correctedDancer.id,
    });

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
      resultsVisible: false,
      requiredDepositPercentage: 30,
      registrationStartsAt: new Date("2026-03-01T12:00:00Z"),
      registrationEndsAt: new Date("2026-04-30T12:00:00Z"),
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
  hasPresentation: boolean;
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
      scheduleId: await readScheduleIdOfCapacityFixture(
        input.scheduleCapacityId,
      ),
      scheduleCapacityId: input.scheduleCapacityId,
      hasPresentation: input.hasPresentation,
    })
    .returning();

  return choreography;
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
