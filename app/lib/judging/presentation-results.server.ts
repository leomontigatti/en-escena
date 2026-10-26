import { and, asc, eq, inArray, isNotNull, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographies,
  events,
  judgeAssignments,
  presentations,
  scores,
  user,
} from "@/db/schema";
import { notWithdrawnChoreography } from "@/lib/choreographies/withdrawn-choreography";
import type { Executor } from "@/lib/finances/choreography-cobro-support.server";
import {
  resolvePresentationResult,
  type PresentationResult,
} from "@/lib/judging/award";

/**
 * What each reader is told about a presentation's evaluation. See
 * docs/domain/judging.md, "Program And Results".
 *
 * The audience decides everything a surface used to put back together by
 * hand: whether the publication gate applies, whose presentations are
 * reachable, and what of the panel is kept. Nothing about a result is stored:
 * the average, the award and the scores are read live, and the snapshot
 * `results.server.ts` takes is only the pair of stamps this module reads as
 * the gate.
 *
 * - `administration` (the administrator and the auditor alike) reads every
 *   result live, published or not.
 * - `academy` reads only its own presentations, and only inside a published
 *   snapshot.
 * - `individual` reads inside a published snapshot too, and with each judge's
 *   score. Which choreographies its link reaches is the individuals module's
 *   call: pass only those.
 *
 * In every audience a withdrawn presentation has no result and is absent, as
 * is a choreography with no presentation.
 */

export type AdministrationAudience = { kind: "administration" };
export type AcademyAudience = { academyId: string; kind: "academy" };
export type IndividualAudience = { kind: "individual" };

export type ResultAudience =
  AcademyAudience | AdministrationAudience | IndividualAudience;

/** One judge's saved score, as the numeric column reads it. */
export type PresentationJudgeValue = {
  judgeId: string;
  judgeName: string;
  value: string | null;
};

export type AdministrationResultEntry = {
  /**
   * Whether the panel has evaluated it: any score row, or a disqualification.
   * Not the same as a `scored` result: a take saved while disqualified has no
   * value, and reinstating keeps it, so an evaluated presentation can still
   * have nothing to average.
   */
  evaluated: boolean;
  /** Whether the academies read it: inside a published snapshot. */
  published: boolean;
  result: PresentationResult;
};

export type AcademyResultEntry = { result: PresentationResult };

export type IndividualResultEntry = {
  /** Each judge who saved a score, by name; none on a disqualification. */
  judges: PresentationJudgeValue[];
  result: PresentationResult;
};

export type ResultEntry<Audience extends ResultAudience> =
  Audience extends AdministrationAudience
    ? AdministrationResultEntry
    : Audience extends AcademyAudience
      ? AcademyResultEntry
      : IndividualResultEntry;

/**
 * Keyed by choreography. A choreography the audience may not read, or whose
 * result it may not read yet, is absent rather than present and empty.
 */
export async function readPresentationResults<Audience extends ResultAudience>(
  audience: Audience,
  choreographyIds: readonly string[],
  executor: Executor = db,
): Promise<Map<string, ResultEntry<Audience>>> {
  if (choreographyIds.length === 0) {
    return new Map();
  }

  // One row per assignment, and one with null judge columns for a
  // presentation nobody is assigned to.
  const rows = await executor
    .select({
      choreographyId: presentations.choreographyId,
      disqualifiedAt: presentations.disqualifiedAt,
      eventPublishedAt: events.resultsPublishedAt,
      judgeId: user.id,
      judgeName: user.name,
      presentationPublishedAt: presentations.resultPublishedAt,
      scoreId: scores.id,
      value: scores.value,
    })
    .from(presentations)
    .innerJoin(
      choreographies,
      eq(choreographies.id, presentations.choreographyId),
    )
    .innerJoin(events, eq(events.id, presentations.eventId))
    .leftJoin(
      judgeAssignments,
      eq(judgeAssignments.presentationId, presentations.id),
    )
    .leftJoin(user, eq(user.id, judgeAssignments.userId))
    .leftJoin(scores, eq(scores.judgeAssignmentId, judgeAssignments.id))
    .where(
      and(
        inArray(presentations.choreographyId, [...choreographyIds]),
        notWithdrawnChoreography(),
        audienceCondition(audience),
      ),
    )
    .orderBy(asc(user.name), asc(user.id));

  const folded = new Map<
    string,
    {
      disqualified: boolean;
      judges: PresentationJudgeValue[];
      published: boolean;
    }
  >();

  for (const row of rows) {
    const entry = folded.get(row.choreographyId) ?? {
      disqualified: row.disqualifiedAt !== null,
      judges: [],
      published:
        row.eventPublishedAt !== null && row.presentationPublishedAt !== null,
    };

    if (row.scoreId !== null && row.judgeId !== null) {
      entry.judges.push({
        judgeId: row.judgeId,
        judgeName: row.judgeName ?? "",
        value: row.value,
      });
    }

    folded.set(row.choreographyId, entry);
  }

  return new Map(
    [...folded].map(([choreographyId, entry]) => {
      const result = resolvePresentationResult({
        disqualified: entry.disqualified,
        values: entry.judges.map((judge) => judge.value),
      });

      return [choreographyId, toEntry(audience, entry, result)];
    }),
  );
}

/**
 * The publication gate: a result is published when its event is published
 * and the presentation is inside the snapshot. Both stamps are asked for, so
 * lifting the event's hides every result at once even though each
 * presentation keeps its own.
 */
function isResultPublished(): SQL | undefined {
  return and(
    isNotNull(events.resultsPublishedAt),
    isNotNull(presentations.resultPublishedAt),
  );
}

function audienceCondition(audience: ResultAudience): SQL | undefined {
  switch (audience.kind) {
    case "administration":
      return undefined;
    case "academy":
      return and(
        eq(choreographies.academyId, audience.academyId),
        isResultPublished(),
      );
    case "individual":
      return isResultPublished();
  }
}

function toEntry<Audience extends ResultAudience>(
  audience: Audience,
  entry: { judges: PresentationJudgeValue[]; published: boolean },
  result: PresentationResult,
): ResultEntry<Audience> {
  switch (audience.kind) {
    case "administration":
      return {
        evaluated: result.kind === "disqualified" || entry.judges.length > 0,
        published: entry.published,
        result,
      } as ResultEntry<Audience>;
    case "academy":
      return { result } as ResultEntry<Audience>;
    case "individual":
      return {
        judges: result.kind === "disqualified" ? [] : entry.judges,
        result,
      } as ResultEntry<Audience>;
  }
}
