import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  judgeAssignments,
  presentations,
  schedules,
  submodalityCriteria,
  user,
} from "@/db/schema";
import {
  createChoreographyRecord,
  createDancer,
  createEventCatalog,
  createSelectedPriceInscriptionForTest,
} from "@/features/portal/choreographies/test-support/db";
import {
  createAcademyUser,
  createSavedEvent,
} from "@/lib/admin/finances/finances.test-support";
import { createScheduleForModalityFixture } from "@/lib/choreographies/registration-test-fixtures.server.db";
import type { ExperienceLevel } from "@/lib/events/experience-levels";

const paidInFullAmount = 100000;

/**
 * The seed every judging test starts from: one event with a catalog, one
 * academy, and a way to add a numbered presentation and put a judge on it. The
 * scores hang off a judge assignment, which hangs off a presentation, which
 * hangs off a fully inscribed choreography, so a test that only wants to insert
 * a score would otherwise spend twenty lines reaching it.
 */
export async function seedJudgingFixture() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const academy = await createAcademyUser({
    academyName: `Academia ${crypto.randomUUID()}`,
    email: `${crypto.randomUUID()}@example.com`,
  });
  const catalog = await createEventCatalog(event.id);

  const createScheduleOn = async (scheduledDate: string) => {
    const schedule = await createScheduleForModalityFixture({
      eventId: event.id,
      modalityId: catalog.modality.id,
    });

    await db
      .update(schedules)
      .set({ scheduledDate })
      .where(eq(schedules.id, schedule.id));

    return schedule.id;
  };

  const addPresentation = async (input: {
    categoryId?: string;
    experienceLevelId?: ExperienceLevel | null;
    name: string;
    orderNumber: number;
    /** Defaults to the catalog schedule's own date; another date gets its own schedule. */
    scheduledDate?: string;
    submodalityId?: string | null;
  }) => {
    const scheduleId = input.scheduledDate
      ? await createScheduleOn(input.scheduledDate)
      : null;
    const choreography = await createChoreographyRecord({
      academyId: academy.academy.id,
      categoryId: input.categoryId ?? catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId:
        input.experienceLevelId === undefined
          ? catalog.level.id
          : input.experienceLevelId,
      modalityId: catalog.modality.id,
      name: input.name,
      scheduleCapacityId: scheduleId ? null : catalog.scheduleCapacity.id,
      scheduleId: scheduleId ?? undefined,
      submodalityId:
        input.submodalityId === undefined
          ? catalog.submodality.id
          : input.submodalityId,
    });
    const dancer = await createDancer(academy.academy.id);

    await createSelectedPriceInscriptionForTest({
      academyId: academy.academy.id,
      allocatedAmount: paidInFullAmount,
      choreographyId: choreography.id,
      dancerId: dancer.id,
      eventId: event.id,
    });

    const [presentation] = await db
      .insert(presentations)
      .values({
        choreographyId: choreography.id,
        eventId: event.id,
        orderNumber: input.orderNumber,
      })
      .returning();

    return { choreographyId: choreography.id, presentationId: presentation.id };
  };

  const assignJudge = async (presentationId: string, judgeId?: string) => {
    const userId =
      judgeId ??
      (
        await db
          .insert(user)
          .values({
            email: `${crypto.randomUUID()}@example.com`,
            name: "Ana Juez",
            role: "judge",
          })
          .returning()
      )[0].id;
    const [assignment] = await db
      .insert(judgeAssignments)
      .values({ presentationId, userId })
      .returning();

    return { judgeAssignmentId: assignment.id, judgeId: userId };
  };

  const addCriterion = async (input: {
    kind?: "adds" | "deducts";
    maximum: number;
    name: string;
    position?: number;
  }) => {
    const [criterion] = await db
      .insert(submodalityCriteria)
      .values({
        eventId: event.id,
        kind: input.kind ?? "adds",
        maximum: input.maximum,
        name: input.name,
        position: input.position ?? 0,
        submodalityId: catalog.submodality.id,
      })
      .returning();

    return criterion;
  };

  return {
    academy,
    addCriterion,
    addPresentation,
    assignJudge,
    catalog,
    event,
  };
}
