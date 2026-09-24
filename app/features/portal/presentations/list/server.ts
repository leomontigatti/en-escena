import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { readPublishedResultChoreographyIds } from "@/lib/judging/results.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import {
  hasEventPresentations,
  isEventProgramVisible,
  readAcademyPresentations,
} from "@/lib/presentations/academy-program.server";

import type { ProgramListRow } from "@/features/program/shared";

/**
 * The academy's presentations page. It only reads: the order is the
 * administration's, and everything the academy can do about a row —covering the
 * deposit— happens on the finances pages this one links to.
 */

/**
 * A row of the academy's own list. It carries what the shared program list
 * reads plus the one thing only this surface acts on: whether the result is
 * published, which is what sends the name to the evaluation detail instead of
 * to the choreography.
 */
export type PortalPresentationRow = ProgramListRow & {
  isResultPublished: boolean;
};

export type PortalPresentationsLoaderData = {
  hasActiveEvent: boolean;
  /** Whether the event has any presentation at all, its own empty state. */
  isEventOrdered: boolean;
  /** The header action to the full program follows it. */
  programVisible: boolean;
  rows: PortalPresentationRow[];
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
      rows: [],
    };
  }

  const [rows, isEventOrdered, programVisible] = await Promise.all([
    readAcademyPresentations({
      academyId: academy.id,
      eventId: activeEvent.id,
    }),
    hasEventPresentations(activeEvent.id),
    isEventProgramVisible(activeEvent.id),
  ]);

  // Asked once for the whole list rather than once per row, and always through
  // the results module: whether a result is published is never re-derived here.
  const publishedIds = await readPublishedResultChoreographyIds(
    rows.map((row) => row.choreographyId),
  );

  return {
    hasActiveEvent: true,
    isEventOrdered,
    programVisible,
    rows: rows.map((row) => ({
      ...row,
      academyName: academy.name,
      isResultPublished: publishedIds.has(row.choreographyId),
    })),
  };
}
