import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  categories,
  choreographies,
  judgeAssignments,
  modalities,
  presentations,
  schedules,
  submodalities,
  user,
} from "@/db/schema";
import { createChoreographyRecord } from "@/features/portal/choreographies/test-support/db";
import {
  createAcademyUser,
  createSavedEvent,
} from "@/lib/admin/finances/finances.test-support";
import { createScheduleForModalityFixture } from "@/lib/choreographies/registration-test-fixtures.server.db";

/**
 * One active event a `Gran final` test registers choreographies into by
 * category name: a category is created the first time its name is used, so a
 * test reads as the names the rule is about. Each modality dances on a
 * schedule of its own, whose day `danceOn` sets.
 */
export async function seedEligibilityFixture() {
  const event = await createSavedEvent();
  const categoryIds = new Map<string, string>();
  const scheduleIds = new Map<string, string>();
  let lastOrderNumber = 0;

  const categoryId = async (name: string) => {
    const existing = categoryIds.get(name);

    if (existing) {
      return existing;
    }

    const [category] = await db
      .insert(categories)
      .values({
        eventId: event.id,
        name,
        minAge: 1,
        maxAge: 100,
        groupTypes: ["solo", "grupal"],
        groupTypeKey: "grupal|solo",
        experienceLevels: [],
        experienceLevelKey: "",
      })
      .returning();
    categoryIds.set(name, category.id);

    return category.id;
  };

  const scheduleId = async (modalityId: string) => {
    const existing = scheduleIds.get(modalityId);

    if (existing) {
      return existing;
    }

    const schedule = await createScheduleForModalityFixture({
      eventId: event.id,
      modalityId,
    });
    scheduleIds.set(modalityId, schedule.id);

    return schedule.id;
  };

  return {
    eventId: event.id,
    addAcademy: async (name: string) => {
      const { academy } = await createAcademyUser({
        academyName: name,
        email: `${crypto.randomUUID()}@example.com`,
      });

      return academy.id;
    },
    addJudge: async (name = "Ana Juez") => {
      const [judge] = await db
        .insert(user)
        .values({
          email: `${crypto.randomUUID()}@example.com`,
          name,
          role: "judge",
        })
        .returning();

      return judge.id;
    },
    /**
     * Puts the judge on the choreography's presentation, numbering it the
     * first time: what makes a judge one of the event's.
     */
    assignJudge: async (judgeId: string, choreographyId: string) => {
      const [existing] = await db
        .select({ id: presentations.id })
        .from(presentations)
        .where(eq(presentations.choreographyId, choreographyId));
      const presentationId =
        existing?.id ??
        (
          await db
            .insert(presentations)
            .values({
              choreographyId,
              eventId: event.id,
              orderNumber: ++lastOrderNumber,
            })
            .returning()
        )[0].id;

      await db
        .insert(judgeAssignments)
        .values({ presentationId, userId: judgeId });
    },
    /** Moves the modality's schedule to `scheduledDate`, a `YYYY-MM-DD` date. */
    danceOn: async (modalityId: string, scheduledDate: string) => {
      await db
        .update(schedules)
        .set({ scheduledDate })
        .where(eq(schedules.id, await scheduleId(modalityId)));
    },
    /** Withdraws every choreography of the academy on the event. */
    withdrawAll: async (academyId: string) => {
      await db
        .update(choreographies)
        .set({ withdrawnAt: new Date() })
        .where(eq(choreographies.academyId, academyId));
    },
    addModality: async (name: string) => {
      const [modality] = await db
        .insert(modalities)
        .values({ eventId: event.id, name })
        .returning();

      return modality.id;
    },
    addSubmodality: async (modalityId: string, name: string) => {
      const [submodality] = await db
        .insert(submodalities)
        .values({ eventId: event.id, modalityId, name })
        .returning();

      return submodality.id;
    },
    register: async (input: {
      academy: string;
      category: string;
      groupType?: "solo" | "grupal";
      modality: string;
      submodality?: string;
      withdrawn?: boolean;
    }) => {
      const choreography = await createChoreographyRecord({
        academyId: input.academy,
        categoryId: await categoryId(input.category),
        eventId: event.id,
        groupType: input.groupType ?? "grupal",
        modalityId: input.modality,
        name: `${input.category} ${crypto.randomUUID().slice(0, 8)}`,
        scheduleCapacityId: null,
        scheduleId: await scheduleId(input.modality),
        submodalityId: input.submodality ?? null,
      });

      if (input.withdrawn) {
        await db
          .update(choreographies)
          .set({ withdrawnAt: new Date() })
          .where(eq(choreographies.id, choreography.id));
      }

      return choreography.id;
    },
  };
}
