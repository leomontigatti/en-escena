import {
  and,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db";
import { events, judgeAssignments, presentations, scores } from "@/db/schema";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";

/**
 * Who owns the publication of an event's results: a snapshot of what the panel
 * had evaluated at the moment administration decided to release it. See
 * docs/domain/judging.md, "Program And Results".
 *
 * Nothing about a result is stored here. The average, the medal, the scores and
 * the disqualification are always read live (`medal.ts`,
 * `presentation-scores.server.ts`), and the snapshot is only a pair of
 * timestamps — the event's and each presentation's. That is what makes a
 * correction after publishing reach the academy without publishing again.
 */

export type ResultsPublication = {
  /** Evaluated presentations outside the snapshot, which `Actualizar` would add. */
  pendingCount: number;
  /** When results last went out, or null while they are hidden. */
  publishedAt: Date | null;
  publishedCount: number;
};

/** "Evaluated" as the panel means it: disqualified, or holding any score row. */
function isEvaluated() {
  return or(
    isNotNull(presentations.disqualifiedAt),
    exists(
      db
        .select({ one: sql`1` })
        .from(judgeAssignments)
        .innerJoin(scores, eq(scores.judgeAssignmentId, judgeAssignments.id))
        .where(eq(judgeAssignments.presentationId, presentations.id)),
    ),
  );
}

/**
 * Both `Mostrar resultados` and `Actualizar resultados`: the event is stamped
 * and so is every evaluated presentation that is not stamped yet, in one
 * transaction. It returns how many presentations are published afterwards.
 *
 * There is no precondition — not even one evaluated presentation, and not the
 * active event: publishing an empty event succeeds and reads as zero.
 */
export async function publishResults(eventId: string): Promise<number> {
  return await db.transaction(async (tx) => {
    const publishedAt = new Date();

    await tx
      .update(events)
      .set({ resultsPublishedAt: publishedAt })
      .where(eq(events.id, eventId));

    await tx
      .update(presentations)
      .set({ resultPublishedAt: publishedAt })
      .where(
        and(
          eq(presentations.eventId, eventId),
          isNull(presentations.resultPublishedAt),
          isEvaluated(),
        ),
      );

    return await countPresentations(
      tx,
      eventId,
      isNotNull(presentations.resultPublishedAt),
    );
  });
}

/**
 * `Ocultar resultados`: the whole snapshot comes down at once. Publishing again
 * later takes what is evaluated then, which is why every presentation's stamp
 * is cleared and not only the event's.
 */
export async function hideResults(eventId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(events)
      .set({ resultsPublishedAt: null })
      .where(eq(events.id, eventId));

    await tx
      .update(presentations)
      .set({ resultPublishedAt: null })
      .where(eq(presentations.eventId, eventId));
  });
}

/**
 * What the event's alert and the confirmations read: when results went out, how
 * many presentations the academies see, and how many the panel has evaluated
 * since. A hidden event reads `null` and two zeroes, because hiding clears
 * every stamp.
 */
export async function readResultsPublication(
  eventId: string,
): Promise<ResultsPublication> {
  const [event] = await db
    .select({ resultsPublishedAt: events.resultsPublishedAt })
    .from(events)
    .where(eq(events.id, eventId));

  const [publishedCount, pendingCount] = await Promise.all([
    countPresentations(db, eventId, isNotNull(presentations.resultPublishedAt)),
    countPresentations(
      db,
      eventId,
      and(isNull(presentations.resultPublishedAt), isEvaluated()),
    ),
  ]);

  return {
    pendingCount,
    publishedAt: event?.resultsPublishedAt ?? null,
    publishedCount,
  };
}

async function countPresentations(
  executor: Executor,
  eventId: string,
  condition: SQL | undefined,
): Promise<number> {
  const [counted] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(presentations)
    .where(and(eq(presentations.eventId, eventId), condition));

  return counted.count;
}

/**
 * The single read every academy surface goes through: a result is published
 * when the event is published and this presentation is inside the snapshot.
 * Both stamps are asked for, so lifting the event's hides every result at once
 * even though each presentation keeps its own.
 */
export async function isPresentationResultPublished(
  choreographyId: string,
): Promise<boolean> {
  const published = await readPublishedResultChoreographyIds([choreographyId]);

  return published.has(choreographyId);
}

/**
 * The same rule asked for a whole list at once, so the academy's presentations
 * page does not ask once per row. Only the published ones come back; a
 * choreography with no presentation is simply absent.
 */
export async function readPublishedResultChoreographyIds(
  choreographyIds: readonly string[],
): Promise<Set<string>> {
  if (choreographyIds.length === 0) {
    return new Set();
  }

  const rows = await db
    .select({ choreographyId: presentations.choreographyId })
    .from(presentations)
    .innerJoin(events, eq(events.id, presentations.eventId))
    .where(
      and(
        inArray(presentations.choreographyId, [...choreographyIds]),
        isNotNull(presentations.resultPublishedAt),
        isNotNull(events.resultsPublishedAt),
      ),
    );

  return new Set(rows.map((row) => row.choreographyId));
}
