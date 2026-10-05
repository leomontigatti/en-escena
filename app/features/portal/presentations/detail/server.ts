import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, presentations, schedules } from "@/db/schema";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { experienceLevelLabel } from "@/lib/events/experience-levels";
import type { Award } from "@/lib/judging/award";
import { readPresentationScores } from "@/lib/judging/presentation-scores.server";
import { isPresentationResultPublished } from "@/lib/judging/results.server";
import type { SheetCriterion } from "@/lib/judging/sheet-total";
import {
  formatGroupTypeLabel,
  type ChoreographyGroupType,
} from "@/lib/portal/choreographies";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import { readVisibleProgramDays } from "@/lib/presentations/program-visibility.server";
import type { FeedbackAudioStorage } from "@/lib/storage/feedback-audio.server";

/**
 * What an academy is told about one of its own presentations once the results
 * are out: the award, the average and what each judge gave and said. See
 * docs/domain/judging.md, "Program And Results".
 *
 * This loader is the whole access control of the academy's results. Three
 * things have to hold for it to answer at all — the presentation is in the
 * academy's active event, the choreography is the academy's own, and the result
 * is published — and it is the only place a `Devolución` is ever signed for an
 * academy, so a presentation that fails any of them leaks nothing, not even
 * that it exists.
 *
 * What must not reach the browser is dropped here rather than hidden in the
 * view: a judge who never scored, on a disqualified presentation every
 * number, leaving the audio, and the order number while the program of the
 * presentation's day is not published, as on the academy's list.
 */

export type PortalEvaluationJudge = {
  /** The judge's sheet by criterion; empty without a sheet or when disqualified. */
  criteriaValues: Record<string, string>;
  feedbackAudioUrl: string | null;
  judgeId: string;
  judgeName: string;
  /** The judge's score as the numeric column reads it; null when disqualified. */
  value: string | null;
};

export type PortalPresentationEvaluationLoaderData = {
  /** Null for a disqualified presentation and when nothing counts. */
  average: number | null;
  /** Empty without a sheet and on a disqualified presentation. */
  criteria: SheetCriterion[];
  /** The subtitle: category, group type, level, modality and submodality. */
  details: string;
  disqualified: boolean;
  judges: PortalEvaluationJudge[];
  award: Award | null;
  /**
   * The heading: the choreography's name and its order number, or the name
   * alone while its day's program is not published.
   */
  title: string;
};

const evaluationNotFoundMessage = "No se encontró la presentación buscada.";

export async function loadPortalPresentationEvaluation(input: {
  params: { choreographyId?: string };
  request: Request;
  storage?: FeedbackAudioStorage;
}): Promise<PortalPresentationEvaluationLoaderData> {
  const { academy } = await requireAcademyUser(input.request);
  const { activeEvent } = await getPortalActiveEventSummaryContext(
    input.request,
  );
  const choreographyId = input.params.choreographyId ?? "";

  if (!activeEvent) {
    throw new Response(evaluationNotFoundMessage, { status: 404 });
  }

  const [presentation] = await db
    .select({
      groupType: choreographies.groupType,
      presentationId: presentations.id,
      scheduledDate: schedules.scheduledDate,
    })
    .from(presentations)
    .innerJoin(
      choreographies,
      eq(choreographies.id, presentations.choreographyId),
    )
    .innerJoin(schedules, eq(schedules.id, choreographies.scheduleId))
    .where(
      and(
        eq(presentations.choreographyId, choreographyId),
        eq(presentations.eventId, activeEvent.id),
        eq(choreographies.academyId, academy.id),
      ),
    );

  if (!presentation || !(await isPresentationResultPublished(choreographyId))) {
    throw new Response(evaluationNotFoundMessage, { status: 404 });
  }

  const visibleDays = await readVisibleProgramDays(activeEvent.id);
  const isDayPublished = visibleDays.includes(presentation.scheduledDate);
  const view = await readPresentationScores({
    presentationId: presentation.presentationId,
    storage: input.storage,
  });

  if (!view) {
    throw new Response(evaluationNotFoundMessage, { status: 404 });
  }

  return {
    average: view.average,
    criteria: view.disqualified ? [] : view.criteria,
    details: formatEvaluationDetails({
      categoryName: view.categoryName,
      experienceLevel: view.experienceLevel,
      groupType: presentation.groupType as ChoreographyGroupType,
      modalityName: view.modalityName,
      submodalityName: view.submodalityName,
    }),
    disqualified: view.disqualified,
    judges: view.judges
      // A judge who saved nothing is nobody's result.
      .filter((judge) => judge.scoreId !== null)
      .map((judge) => ({
        criteriaValues: view.disqualified ? {} : judge.criteriaValues,
        feedbackAudioUrl: judge.feedbackAudioUrl,
        judgeId: judge.judgeId,
        judgeName: judge.judgeName,
        value: view.disqualified ? null : judge.value,
      })),
    award: view.award,
    // A published result does not publish its day's order: the number stays
    // with the program, which the day may still be reordered under.
    title: isDayPublished
      ? `${view.name} · N.º ${view.orderNumber}`
      : view.name,
  };
}

/** The line under the title, skipping what the choreography does not declare. */
function formatEvaluationDetails(input: {
  categoryName: string;
  experienceLevel: string | null;
  groupType: ChoreographyGroupType;
  modalityName: string;
  submodalityName: string | null;
}): string {
  return [
    input.categoryName,
    formatGroupTypeLabel(input.groupType),
    experienceLevelLabel(input.experienceLevel),
    input.modalityName,
    input.submodalityName,
  ]
    .filter(Boolean)
    .join(" · ");
}
