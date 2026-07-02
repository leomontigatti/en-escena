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
import { recalculateLinkedChoreographiesForDancerBirthDateCorrection } from "@/lib/choreographies/dancer-birthdate-correction.server";
import { createAcademySession } from "@/lib/choreographies/registration-test-fixtures.server.db";
import {
  experienceLevelLabels,
  isExperienceLevel,
} from "@/lib/events/experience-levels";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe.sequential("dancer birth date choreography correction", () => {
  test("recalculates eligible linked coreografias, preserves or clears nivel, and skips presented records", async () => {
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
    const noCategoryCatalog = await createCorrectionCatalog({
      categoryRequiresLevelOnOlderRange: false,
      eventName: "Sin categoría",
      includeOlderCategory: false,
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
    const noCategoryChoreography = await createLinkedChoreography({
      academyId: academy.academyId,
      categoryId: noCategoryCatalog.youngerCategory.id,
      eventId: noCategoryCatalog.event.id,
      experienceLevelId: noCategoryCatalog.level.id,
      hasPresentation: false,
      modalityId: noCategoryCatalog.modality.id,
      name: "Sin categoría",
      scheduleCapacityId: noCategoryCatalog.scheduleCapacity.id,
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
        choreographyId: noCategoryChoreography.id,
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

    await recalculateLinkedChoreographiesForDancerBirthDateCorrection({
      dancerId: correctedDancer.id,
    });

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
    await expectChoreographyState(noCategoryChoreography.id, {
      categoryId: null,
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
    await expectDancerAgeLink(
      noCategoryChoreography.id,
      correctedDancer.id,
      15,
    );
    await expectDancerAgeLink(presentedChoreography.id, correctedDancer.id, 12);
  });
});

async function createCorrectionCatalog(input: {
  eventName: string;
  categoryRequiresLevelOnOlderRange: boolean;
  includeOlderCategory?: boolean;
}) {
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
      groupTypes: ["solo"],
      groupTypeKey: "solo",
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
              groupTypes: ["solo"],
              groupTypeKey: "solo",
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
    groupType: "solo",
    amount: 10000,
    paymentDeadline: "2026-05-31",
    scheduleId: null,
  });
  const [scheduleCapacity] = await db
    .insert(scheduleCapacities)
    .values({
      scheduleId: schedule.id,
      groupType: "solo",
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
  categoryId: string | null;
  experienceLevelId: string | null;
  scheduleCapacityId: string;
  hasPresentation: boolean;
}) {
  const [choreography] = await db
    .insert(choreographies)
    .values({
      academyId: input.academyId,
      eventId: input.eventId,
      name: input.name,
      modalityId: input.modalityId,
      submodalityId: null,
      groupType: "solo",
      categoryId: input.categoryId,
      categoryCalculationMode: "oldest",
      categoryAgeBasis: 12,
      experienceLevelId:
        input.experienceLevelId && isExperienceLevel(input.experienceLevelId)
          ? input.experienceLevelId
          : null,
      scheduleId: null,
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
    categoryCalculationMode: "oldest";
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
