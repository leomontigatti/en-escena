import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import {
  hasEventPresentations,
  isEventProgramVisible,
  readAcademyPresentations,
} from "@/lib/presentations/academy-program.server";

import {
  getPrototypePublishedResult,
  isPrototypeSheetModality,
  numberRowsInMemory,
} from "@/features/judging/prototype/results-fixtures";
import { experienceLevelLabels } from "@/lib/events/experience-levels";
import type { ProgramListRow } from "@/features/program/shared";
import { readParticipationRows } from "@/lib/presentations/participation.server";

/**
 * The academy's presentations page. It only reads: the order is the
 * administration's, and everything the academy can do about a row —covering the
 * deposit— happens on the finances pages this one links to.
 */

export type PortalPresentationsLoaderData = {
  hasActiveEvent: boolean;
  /** Whether the event has any presentation at all, its own empty state. */
  isEventOrdered: boolean;
  /** The header action to the full program follows it. */
  programVisible: boolean;
  /** PROTOTYPE (#223): `?resultados=ocultos` shows the list before publishing. */
  prototypeResultsPublished?: boolean;
  rows: ProgramListRow[];
};

export async function loadPortalPresentationsList(
  request: Request,
): Promise<PortalPresentationsLoaderData> {
  const { academy } = await requireAcademyUser(request);
  const { activeEvent } = await getPortalActiveEventSummaryContext(request);

  if (!activeEvent) {
    return {
      hasActiveEvent: false,
      isEventOrdered: false,
      programVisible: false,
      prototypeResultsPublished: false,
      rows: [],
    };
  }

  const [rows, , programVisible, participation] = await Promise.all([
    readAcademyPresentations({
      academyId: academy.id,
      eventId: activeEvent.id,
    }),
    hasEventPresentations(activeEvent.id),
    isEventProgramVisible(activeEvent.id),
    readParticipationRows(activeEvent.id),
  ]);
  // PROTOTYPE (#223): the admin list's in-memory numbers, so both agree.
  const numbered = new Map(
    numberRowsInMemory(participation).map((row) => [row.choreographyId, row]),
  );

  return {
    hasActiveEvent: true,
    isEventOrdered: true,
    programVisible,
    prototypeResultsPublished:
      new URL(request.url).searchParams.get("resultados") !== "ocultos",
    rows: rows.map((row) => {
      const orderNumber =
        row.orderNumber ??
        numbered.get(row.choreographyId)?.orderNumber ??
        null;
      const experienceLevel =
        numbered.get(row.choreographyId)?.experienceLevel ?? null;
      return {
        ...row,
        academyName: academy.name,
        orderNumber,
        prototypeLevelLabel: experienceLevel
          ? (experienceLevelLabels[experienceLevel] ?? experienceLevel)
          : null,
        prototypeResult: getPrototypePublishedResult({
          orderNumber,
          isSheet: isPrototypeSheetModality(row.modalityName),
        }),
      };
    }),
  };
}
