import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { judgeAssignments, presentations, scores, user } from "@/db/schema";
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
import { evaluatedChoreographyIds } from "@/lib/presentations/evaluation-lock.test-support";
import {
  assignJudges,
  readAssignableJudges,
  readAssignedJudges,
  removeJudges,
} from "@/lib/presentations/judge-assignments.server";
import {
  movePresentation,
  runAutomaticOrdering,
} from "@/lib/presentations/participation.server";
import { deleteChoreographyPresentation } from "@/lib/presentations/presentation-queries.server";

import * as businessTimeZone from "@/lib/shared/business-time-zone";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

vi.mock(
  "@/lib/presentations/evaluation-lock.server",
  async () =>
    (await import("@/lib/presentations/evaluation-lock.test-support"))
      .evaluationLockStub,
);

installDatabaseTestHooks();

beforeEach(() => {
  vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
    "2026-04-10",
  );
});

afterEach(() => {
  evaluatedChoreographyIds.clear();
  vi.restoreAllMocks();
});

const paidInFullAmount = 100000;

async function createUser(input: {
  name: string;
  role: "admin" | "judge";
  suspended?: boolean;
}) {
  const [created] = await db
    .insert(user)
    .values({
      email: `${crypto.randomUUID()}@example.com`,
      name: input.name,
      role: input.role,
      suspended: input.suspended ?? false,
    })
    .returning();

  return created;
}

async function seedEvent() {
  const event = await createSavedEvent({ requiredDepositPercentage: 30 });
  const academy = await createAcademyUser({
    academyName: `Academia ${crypto.randomUUID()}`,
    email: `${crypto.randomUUID()}@example.com`,
  });
  const catalog = await createEventCatalog(event.id);

  const addChoreography = async (input: {
    belowDeposit?: boolean;
    name: string;
    orderNumber?: number;
  }) => {
    const choreography = await createChoreographyRecord({
      academyId: academy.academy.id,
      categoryId: catalog.categoryWithLevel.id,
      eventId: event.id,
      experienceLevelId: catalog.level.id,
      modalityId: catalog.modality.id,
      name: input.name,
      scheduleCapacityId: catalog.scheduleCapacity.id,
    });
    const dancer = await createDancer(academy.academy.id);

    await createSelectedPriceInscriptionForTest({
      academyId: academy.academy.id,
      allocatedAmount: input.belowDeposit ? undefined : paidInFullAmount,
      choreographyId: choreography.id,
      dancerId: dancer.id,
      eventId: event.id,
    });

    if (input.orderNumber !== undefined) {
      await db.insert(presentations).values({
        choreographyId: choreography.id,
        eventId: event.id,
        orderNumber: input.orderNumber,
      });
    }

    return choreography;
  };

  return { academy, addChoreography, catalog, event };
}

/** Puts a saved score on one judge's assignment, which is what locks the pair. */
async function scoreAssignment(choreographyId: string, judgeId: string) {
  const [assignment] = await db
    .select({ id: judgeAssignments.id })
    .from(judgeAssignments)
    .innerJoin(
      presentations,
      eq(judgeAssignments.presentationId, presentations.id),
    )
    .where(
      and(
        eq(presentations.choreographyId, choreographyId),
        eq(judgeAssignments.userId, judgeId),
      ),
    );

  await db
    .insert(scores)
    .values({ judgeAssignmentId: assignment.id, value: "90" });
}

async function readAssignmentPairs(choreographyId: string) {
  const rows = await db
    .select({ userId: judgeAssignments.userId })
    .from(judgeAssignments)
    .innerJoin(
      presentations,
      eq(judgeAssignments.presentationId, presentations.id),
    )
    .where(eq(presentations.choreographyId, choreographyId));

  return rows.map((row) => row.userId).sort();
}

describe("readAssignableJudges", () => {
  test("offers the judges who are not suspended, and nobody else", async () => {
    const judge = await createUser({ name: "Ana Juez", role: "judge" });
    await createUser({ name: "Beto Juez", role: "judge", suspended: true });
    await createUser({ name: "Carla Admin", role: "admin" });

    const assignable = await readAssignableJudges();

    expect(assignable.map((entry) => entry.id)).toEqual([judge.id]);
    expect(assignable[0].name).toBe("Ana Juez");
  });
});

describe("assignJudges", () => {
  test("skips the pairs that already exist instead of refusing", async () => {
    const { addChoreography } = await seedEvent();
    const first = await addChoreography({ name: "Una", orderNumber: 1 });
    const second = await addChoreography({ name: "Otra", orderNumber: 2 });
    const judge = await createUser({ name: "Ana Juez", role: "judge" });
    const other = await createUser({ name: "Bruno Juez", role: "judge" });

    await assignJudges({
      choreographyIds: [first.id],
      judgeIds: [judge.id],
    });
    const result = await assignJudges({
      choreographyIds: [first.id, second.id],
      judgeIds: [judge.id, other.id],
    });

    expect(result).toEqual({ judgeCount: 2, presentationCount: 2 });
    expect(await readAssignmentPairs(first.id)).toEqual(
      [judge.id, other.id].sort(),
    );
    expect(await readAssignmentPairs(second.id)).toEqual(
      [judge.id, other.id].sort(),
    );
  });

  test("leaves out a suspended or non-judge user", async () => {
    const { addChoreography } = await seedEvent();
    const choreography = await addChoreography({
      name: "Una",
      orderNumber: 1,
    });
    const suspended = await createUser({
      name: "Beto Juez",
      role: "judge",
      suspended: true,
    });
    const admin = await createUser({ name: "Carla Admin", role: "admin" });

    const result = await assignJudges({
      choreographyIds: [choreography.id],
      judgeIds: [suspended.id, admin.id],
    });

    expect(result).toEqual({ judgeCount: 0, presentationCount: 0 });
    expect(await readAssignmentPairs(choreography.id)).toEqual([]);
  });

  test("reaches no presentation for a choreography that has none", async () => {
    const { addChoreography } = await seedEvent();
    const late = await addChoreography({ name: "Tardía" });
    const judge = await createUser({ name: "Ana Juez", role: "judge" });

    const result = await assignJudges({
      choreographyIds: [late.id],
      judgeIds: [judge.id],
    });

    expect(result).toEqual({ judgeCount: 0, presentationCount: 0 });
  });
});

describe("removeJudges", () => {
  test("takes each chosen judge off every selected row that has them", async () => {
    const { addChoreography } = await seedEvent();
    const first = await addChoreography({ name: "Una", orderNumber: 1 });
    const second = await addChoreography({ name: "Otra", orderNumber: 2 });
    const third = await addChoreography({ name: "Tercera", orderNumber: 3 });
    const judge = await createUser({ name: "Ana Juez", role: "judge" });
    const other = await createUser({ name: "Bruno Juez", role: "judge" });

    await assignJudges({
      choreographyIds: [first.id, second.id],
      judgeIds: [judge.id, other.id],
    });
    await assignJudges({ choreographyIds: [third.id], judgeIds: [judge.id] });

    const result = await removeJudges({
      choreographyIds: [first.id, second.id],
      judgeIds: [judge.id],
    });

    expect(result).toEqual({
      judgeCount: 1,
      keptCount: 0,
      presentationCount: 2,
    });
    expect(await readAssignmentPairs(first.id)).toEqual([other.id]);
    expect(await readAssignmentPairs(second.id)).toEqual([other.id]);
    expect(await readAssignmentPairs(third.id)).toEqual([judge.id]);
  });

  test("refuses the one pair that already has a score", async () => {
    const { addChoreography } = await seedEvent();
    const scored = await addChoreography({ name: "Una", orderNumber: 1 });
    const judge = await createUser({ name: "Ana Juez", role: "judge" });

    await assignJudges({ choreographyIds: [scored.id], judgeIds: [judge.id] });
    await scoreAssignment(scored.id, judge.id);

    const result = await removeJudges({
      choreographyIds: [scored.id],
      judgeIds: [judge.id],
    });

    expect(result).toEqual({
      judgeCount: 0,
      keptCount: 1,
      presentationCount: 0,
    });
    expect(await readAssignmentPairs(scored.id)).toEqual([judge.id]);
  });

  test("removes the unscored pairs of a selection and keeps the scored ones", async () => {
    const { addChoreography } = await seedEvent();
    const scored = await addChoreography({ name: "Una", orderNumber: 1 });
    const unscored = await addChoreography({ name: "Otra", orderNumber: 2 });
    const judge = await createUser({ name: "Ana Juez", role: "judge" });
    const other = await createUser({ name: "Bruno Juez", role: "judge" });

    await assignJudges({
      choreographyIds: [scored.id, unscored.id],
      judgeIds: [judge.id, other.id],
    });
    await scoreAssignment(scored.id, judge.id);

    const result = await removeJudges({
      choreographyIds: [scored.id, unscored.id],
      judgeIds: [judge.id, other.id],
    });

    expect(result).toEqual({
      judgeCount: 2,
      keptCount: 1,
      presentationCount: 2,
    });
    expect(await readAssignmentPairs(scored.id)).toEqual([judge.id]);
    expect(await readAssignmentPairs(unscored.id)).toEqual([]);
  });
});

describe("readAssignedJudges", () => {
  test("names the judges of each choreography that has any", async () => {
    const { addChoreography } = await seedEvent();
    const first = await addChoreography({ name: "Una", orderNumber: 1 });
    const second = await addChoreography({ name: "Otra", orderNumber: 2 });
    const judge = await createUser({ name: "Ana Juez", role: "judge" });

    await assignJudges({ choreographyIds: [first.id], judgeIds: [judge.id] });

    const assigned = await readAssignedJudges([first.id, second.id]);

    expect(assigned.byChoreography.get(first.id)).toEqual([judge.id]);
    expect(assigned.byChoreography.get(second.id)).toBeUndefined();
    expect(assigned.judges).toEqual([{ id: judge.id, name: "Ana Juez" }]);
  });
});

describe("assignments through the order's own writes", () => {
  test("survive a new automatic ordering and a manual move", async () => {
    const { addChoreography, event } = await seedEvent();
    const first = await addChoreography({ name: "Una", orderNumber: 1 });
    const second = await addChoreography({ name: "Otra", orderNumber: 2 });
    const judge = await createUser({ name: "Ana Juez", role: "judge" });

    await assignJudges({
      choreographyIds: [first.id, second.id],
      judgeIds: [judge.id],
    });

    expect((await runAutomaticOrdering(event.id)).ok).toBe(true);
    expect(await readAssignmentPairs(first.id)).toEqual([judge.id]);

    const moved = await movePresentation({
      choreographyId: first.id,
      eventId: event.id,
      fromOrderNumber: 1,
      toOrderNumber: 2,
    });

    expect(moved.ok).toBe(true);
    expect(await readAssignmentPairs(first.id)).toEqual([judge.id]);
    expect(await readAssignmentPairs(second.id)).toEqual([judge.id]);
  });

  test("go with the presentation when the choreography is deleted", async () => {
    const { addChoreography } = await seedEvent();
    const choreography = await addChoreography({
      name: "Una",
      orderNumber: 1,
    });
    const judge = await createUser({ name: "Ana Juez", role: "judge" });

    await assignJudges({
      choreographyIds: [choreography.id],
      judgeIds: [judge.id],
    });
    await deleteChoreographyPresentation(db, choreography.id);

    expect(await db.select().from(judgeAssignments)).toEqual([]);
    expect(await db.select().from(presentations)).toEqual([]);
  });
});
