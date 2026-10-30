import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  readChoreographyCertificates,
  type CertificateRecipient,
} from "@/lib/certificates/certificates.server";
import {
  experienceLevelDisplayLabel,
  type ExperienceLevelRequirement,
} from "@/lib/choreographies/experience-level-requirement";
import type { PresentationResult } from "@/lib/judging/award";
import {
  readPresentationEvaluation,
  type AcademyEvaluationJudge,
} from "@/lib/judging/presentation-evaluation.server";
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
 * Whether the academy reads it at all — its own presentation, inside a
 * published snapshot — and what of the panel it keeps is the academy audience
 * of `presentation-evaluation.server.ts`. This loader adds the active event,
 * and the one answer for everything it may not read: "not found", which leaks
 * nothing, not even that the presentation exists. It is the only place a
 * `Devolución` is ever signed for an academy.
 *
 * The order number stays withheld while the program of the presentation's day
 * is not published, as on the academy's list.
 */

export type PortalEvaluationJudge = AcademyEvaluationJudge;

export type PortalPresentationEvaluationLoaderData = {
  /** What `Descargar certificados` offers; null when it is not offered. */
  certificates: {
    choreographyId: string;
    /** The name alone, as the certificate prints it. */
    choreographyName: string;
    recipients: CertificateRecipient[];
  } | null;
  /** Empty without a sheet and on a disqualified presentation. */
  criteria: SheetCriterion[];
  /** The subtitle: category, group type, level, modality and submodality. */
  details: string;
  judges: PortalEvaluationJudge[];
  result: PresentationResult;
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
  const audience = { academyId: academy.id, kind: "academy" } as const;
  const view = activeEvent
    ? await readPresentationEvaluation(
        audience,
        { choreographyId },
        { storage: input.storage },
      )
    : null;

  if (!activeEvent || !view || view.eventId !== activeEvent.id) {
    throw new Response(evaluationNotFoundMessage, { status: 404 });
  }

  const [visibleDays, certificates] = await Promise.all([
    readVisibleProgramDays(activeEvent.id),
    readChoreographyCertificates(audience, choreographyId),
  ]);

  return {
    certificates: certificates && {
      choreographyId,
      choreographyName: certificates.choreographyName,
      recipients: certificates.recipients,
    },
    criteria: view.criteria,
    details: formatEvaluationDetails(view),
    judges: view.judges,
    result: view.result,
    // A published result does not publish its day's order: the number stays
    // with the program, which the day may still be reordered under.
    title: visibleDays.includes(view.scheduledDate)
      ? `${view.name} · N.º ${view.orderNumber}`
      : view.name,
  };
}

/**
 * The line under the title: a missing submodality is skipped, and an empty
 * level is worded by why it is empty (`Sin asignar`, `Sin nivel`, `No aplica`).
 */
function formatEvaluationDetails(input: {
  categoryName: string;
  experienceLevel: string | null;
  experienceLevelRequirement: ExperienceLevelRequirement;
  groupType: ChoreographyGroupType;
  modalityName: string;
  submodalityName: string | null;
}): string {
  return [
    input.categoryName,
    formatGroupTypeLabel(input.groupType),
    experienceLevelDisplayLabel(
      input.experienceLevel,
      input.experienceLevelRequirement,
    ),
    input.modalityName,
    input.submodalityName,
  ]
    .filter(Boolean)
    .join(" · ");
}
