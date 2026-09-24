import { db } from "@/db";
import {
  judgeAssignments,
  presentations,
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

  const addPresentation = async (input: {
    name: string;
    orderNumber: number;
  }) => {
    const choreography = await createChoreographyRecord({
      academyId: academy.academy.id,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: input.name,
      scheduleCapacityId: catalog.scheduleCapacity.id,
      submodalityId: catalog.submodality.id,
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

  const assignJudge = async (presentationId: string) => {
    const [judge] = await db
      .insert(user)
      .values({
        email: `${crypto.randomUUID()}@example.com`,
        name: "Ana Juez",
        role: "judge",
      })
      .returning();
    const [assignment] = await db
      .insert(judgeAssignments)
      .values({ presentationId, userId: judge.id })
      .returning();

    return { judgeAssignmentId: assignment.id, judgeId: judge.id };
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
