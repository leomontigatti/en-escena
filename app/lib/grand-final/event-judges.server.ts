import { eq } from "drizzle-orm";

import { db } from "@/db";
import {
  finalistPicks,
  judgeAssignments,
  presentations,
  user,
} from "@/db/schema";

/** One of the event's judges: a column of the `Gran final` list. */
export type GrandFinalJudge = { id: string; name: string };

/**
 * The event's judges: the ones assigned to one of its presentations, and any
 * who holds a pick in it, so a judge taken off every presentation still shows
 * the pick they made. A judge user with no tie to the event is not one of its
 * columns.
 */
export async function readEventJudges(
  eventId: string,
): Promise<GrandFinalJudge[]> {
  const [assigned, picking] = await Promise.all([
    db
      .selectDistinct({ id: user.id, name: user.name })
      .from(judgeAssignments)
      .innerJoin(
        presentations,
        eq(presentations.id, judgeAssignments.presentationId),
      )
      .innerJoin(user, eq(user.id, judgeAssignments.userId))
      .where(eq(presentations.eventId, eventId)),
    db
      .selectDistinct({ id: user.id, name: user.name })
      .from(finalistPicks)
      .innerJoin(user, eq(user.id, finalistPicks.judgeId))
      .where(eq(finalistPicks.eventId, eventId)),
  ]);
  const byId = new Map(
    [...assigned, ...picking].map((judge) => [judge.id, judge]),
  );

  return [...byId.values()].sort((left, right) =>
    left.name.localeCompare(right.name, "es"),
  );
}
