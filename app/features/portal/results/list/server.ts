import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import type { PresentationResult } from "@/lib/judging/award";
import { readPresentationResults } from "@/lib/judging/presentation-results.server";
import { readResultsPublication } from "@/lib/judging/results.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import { readAcademyPresentations } from "@/lib/presentations/academy-program.server";
import { readVisibleProgramDays } from "@/lib/presentations/program-visibility.server";

import type { ProgramListRow } from "@/features/program/shared";

/**
 * The academy's results page: its own presentations in the active event whose
 * result administration published, each with the award and average the
 * evaluation detail shows. What an academy reads, and when, is
 * `presentation-results.server.ts`'s call, and the figures are read live.
 */

export type PortalResultRow = ProgramListRow & {
  result: PresentationResult;
};

export type PortalResultsLoaderData = {
  /**
   * Whether the event's results are out, apart from the rows: once they are,
   * an empty list means none of this academy's presentations made it in.
   */
  areResultsPublished: boolean;
  hasActiveEvent: boolean;
  rows: PortalResultRow[];
};

export async function loadPortalResultsList(
  request: Request,
): Promise<PortalResultsLoaderData> {
  const { academy } = await requireAcademyUser(request);
  const { activeEvent } = await getPortalActiveEventSummaryContext(request);

  if (!activeEvent) {
    return { areResultsPublished: false, hasActiveEvent: false, rows: [] };
  }

  // The same rows as the presentations page, so a number of a day whose
  // program is not published stays withheld here too.
  const visibleDays = await readVisibleProgramDays(activeEvent.id);
  const [rows, publication] = await Promise.all([
    readAcademyPresentations({
      academyId: academy.id,
      eventId: activeEvent.id,
      visibleDays,
    }),
    readResultsPublication(activeEvent.id),
  ]);
  const results = await readPresentationResults(
    { academyId: academy.id, kind: "academy" },
    rows.map((row) => row.choreographyId),
  );

  return {
    areResultsPublished: publication.publishedAt !== null,
    hasActiveEvent: true,
    rows: rows.flatMap((row) => {
      const entry = results.get(row.choreographyId);

      return entry
        ? [{ ...row, academyName: academy.name, result: entry.result }]
        : [];
    }),
  };
}
