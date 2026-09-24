import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographies, presentations, scores } from "@/db/schema";
import { removeChoreography } from "@/lib/choreographies/choreography-removal.server";
import type { Transaction } from "@/lib/finances/choreography-cobro-support.server";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import {
  findEvaluatedChoreographyIds,
  hasEvaluatedPresentation,
} from "@/lib/presentations/evaluation-lock.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

async function seedThreeNumbered() {
  const fixture = await seedJudgingFixture();
  const scored = await fixture.addPresentation({ name: "Una", orderNumber: 1 });
  const disqualified = await fixture.addPresentation({
    name: "Otra",
    orderNumber: 2,
  });
  const untouched = await fixture.addPresentation({
    name: "Tercera",
    orderNumber: 3,
  });

  const { judgeAssignmentId } = await fixture.assignJudge(
    scored.presentationId,
  );
  await db.insert(scores).values({ judgeAssignmentId, value: "90" });
  await db
    .update(presentations)
    .set({ disqualifiedAt: new Date("2026-10-10T23:00:00Z") })
    .where(eq(presentations.id, disqualified.presentationId));

  return { disqualified, fixture, scored, untouched };
}

/**
 * Runs `work` in a transaction and always rolls it back, so what it wrote is
 * visible to the executor it is given and to nothing else. Drizzle signals the
 * rollback by throwing, which is not a failure here.
 */
async function inRolledBackTransaction<Result>(
  work: (executor: Transaction) => Promise<Result>,
): Promise<Result> {
  let result: Result | undefined;

  await db
    .transaction(async (tx) => {
      result = await work(tx);
      tx.rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof Error) || error.message !== "Rollback") {
        throw error;
      }
    });

  return result as Result;
}

describe("hasEvaluatedPresentation", () => {
  test("answers for a scored, a disqualified and an untouched presentation", async () => {
    const { disqualified, scored, untouched } = await seedThreeNumbered();

    expect(await hasEvaluatedPresentation(scored.choreographyId)).toBe(true);
    expect(await hasEvaluatedPresentation(disqualified.choreographyId)).toBe(
      true,
    );
    expect(await hasEvaluatedPresentation(untouched.choreographyId)).toBe(
      false,
    );
  });

  test("answers false for a choreography with no presentation at all", async () => {
    const fixture = await seedJudgingFixture();
    const numbered = await fixture.addPresentation({
      name: "Una",
      orderNumber: 1,
    });
    await db
      .delete(presentations)
      .where(eq(presentations.id, numbered.presentationId));

    expect(await hasEvaluatedPresentation(numbered.choreographyId)).toBe(false);
  });

  test("still answers false once the only score is gone", async () => {
    const { scored } = await seedThreeNumbered();

    await db.delete(scores);

    expect(await hasEvaluatedPresentation(scored.choreographyId)).toBe(false);
  });

  /**
   * The reason both functions take an executor: a caller that holds the
   * presentation row locked asks inside its own transaction, and a read through
   * `db` would answer from outside that lock. Here the transaction is the only
   * place the disqualification exists, so reading through it is the only way to
   * see it.
   */
  test("reads the executor it is given, not a second connection", async () => {
    const { untouched } = await seedThreeNumbered();

    const evaluatedInside = await inRolledBackTransaction(async (tx) => {
      await tx
        .update(presentations)
        .set({ disqualifiedAt: new Date("2026-10-10T23:00:00Z") })
        .where(eq(presentations.id, untouched.presentationId));

      return await hasEvaluatedPresentation(untouched.choreographyId, tx);
    });

    expect(evaluatedInside).toBe(true);

    expect(await hasEvaluatedPresentation(untouched.choreographyId)).toBe(
      false,
    );
  });
});

describe("findEvaluatedChoreographyIds", () => {
  test("names the evaluated ones out of the batch it is asked about", async () => {
    const { disqualified, scored, untouched } = await seedThreeNumbered();

    const evaluated = await findEvaluatedChoreographyIds([
      scored.choreographyId,
      disqualified.choreographyId,
      untouched.choreographyId,
    ]);

    expect([...evaluated].sort()).toEqual(
      [scored.choreographyId, disqualified.choreographyId].sort(),
    );
  });

  test("answers an empty set for an empty batch without reaching the database", async () => {
    expect(await findEvaluatedChoreographyIds([])).toEqual(new Set());
  });

  test("leaves out a choreography it was not asked about", async () => {
    const { disqualified, scored } = await seedThreeNumbered();

    const evaluated = await findEvaluatedChoreographyIds([
      scored.choreographyId,
    ]);

    expect([...evaluated]).toEqual([scored.choreographyId]);
    expect(evaluated.has(disqualified.choreographyId)).toBe(false);
  });

  test("reads the executor it is given, not a second connection", async () => {
    const { untouched } = await seedThreeNumbered();

    const evaluatedInside = await inRolledBackTransaction(async (tx) =>
      tx
        .update(presentations)
        .set({ disqualifiedAt: new Date("2026-10-10T23:00:00Z") })
        .where(eq(presentations.id, untouched.presentationId))
        .then(() =>
          findEvaluatedChoreographyIds([untouched.choreographyId], tx),
        ),
    );

    expect([...evaluatedInside]).toEqual([untouched.choreographyId]);

    expect(
      await findEvaluatedChoreographyIds([untouched.choreographyId]),
    ).toEqual(new Set());
  });
});

/**
 * The seam's call sites are unchanged by this slice, so each one keeps its own
 * tests. What none of them can show, because they replace the seam with a stub,
 * is that a real saved score reaches a real lock through the real body. One
 * site stands for all of them: removal asks inside its own `FOR UPDATE`
 * transaction, which is the case the executor argument exists for.
 */
describe("a lock site reading the filled seam", () => {
  test("refuses to remove a choreography whose presentation was scored", async () => {
    const { scored, untouched } = await seedThreeNumbered();

    expect(await removeChoreography(scored.choreographyId)).toBe("evaluated");
    expect(
      await db
        .select({ id: choreographies.id })
        .from(choreographies)
        .where(eq(choreographies.id, scored.choreographyId)),
    ).toHaveLength(1);

    expect(await removeChoreography(untouched.choreographyId)).not.toBe(
      "evaluated",
    );
  });

  test("refuses to remove a disqualified presentation's choreography", async () => {
    const { disqualified } = await seedThreeNumbered();

    expect(await removeChoreography(disqualified.choreographyId)).toBe(
      "evaluated",
    );
  });
});
