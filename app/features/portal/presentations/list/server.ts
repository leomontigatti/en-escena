import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { readPublishedResultChoreographyIds } from "@/lib/judging/results.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import {
  hasPublishedPresentations,
  readAcademyPresentations,
} from "@/lib/presentations/academy-program.server";
import { readVisibleProgramDays } from "@/lib/presentations/program-visibility.server";

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
  /**
   * Whether a published day has any presentation, its own empty state: an
   * event ordered with no day published has told the academy nothing yet.
   */
  hasPublishedPresentations: boolean;
  /** Whether any day's program is published; the link to it follows. */
  hasVisibleDay: boolean;
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
      hasPublishedPresentations: false,
      hasVisibleDay: false,
      rows: [],
    };
  }

  // The published days are read first and handed to both reads, so a row of a
  // hidden day loses its number here, on the server, and never reaches the page.
  const visibleDays = await readVisibleProgramDays(activeEvent.id);
  const [rows, hasPublished] = await Promise.all([
    readAcademyPresentations({
      academyId: academy.id,
      eventId: activeEvent.id,
      visibleDays,
    }),
    hasPublishedPresentations({ eventId: activeEvent.id, visibleDays }),
  ]);

  // Asked once for the whole list rather than once per row, and always through
  // the results module: whether a result is published is never re-derived here.
  const publishedIds = await readPublishedResultChoreographyIds(
    rows.map((row) => row.choreographyId),
  );

  return {
    hasActiveEvent: true,
    hasPublishedPresentations: hasPublished,
    hasVisibleDay: visibleDays.length > 0,
    rows: rows.map((row) => ({
      ...row,
      academyName: academy.name,
      isResultPublished: publishedIds.has(row.choreographyId),
    })),
  };
}
