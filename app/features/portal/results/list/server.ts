import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import type { Award } from "@/lib/judging/award";
import { readPresentationResults } from "@/lib/judging/presentation-results.server";
import { readPublishedResultChoreographyIds } from "@/lib/judging/results.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import { readAcademyPresentations } from "@/lib/presentations/academy-program.server";
import { readVisibleProgramDays } from "@/lib/presentations/program-visibility.server";

import type { ProgramListRow } from "@/features/program/shared";

/**
 * The academy's results page: its own presentations in the active event whose
 * result administration published, each with the award and average the
 * evaluation detail shows. Publication is the results module's call, and the
 * figures are read live, as everywhere else.
 */

export type PortalResultRow = ProgramListRow & {
  /** `null` when disqualified. */
  average: number | null;
  award: Award | null;
  disqualified: boolean;
};

export type PortalResultsLoaderData = {
  hasActiveEvent: boolean;
  rows: PortalResultRow[];
};

export async function loadPortalResultsList(
  request: Request,
): Promise<PortalResultsLoaderData> {
  const { academy } = await requireAcademyUser(request);
  const { activeEvent } = await getPortalActiveEventSummaryContext(request);

  if (!activeEvent) {
    return { hasActiveEvent: false, rows: [] };
  }

  // The same rows as the presentations page, so a number of a day whose
  // program is not published stays withheld here too.
  const visibleDays = await readVisibleProgramDays(activeEvent.id);
  const rows = await readAcademyPresentations({
    academyId: academy.id,
    eventId: activeEvent.id,
    visibleDays,
  });
  const publishedIds = await readPublishedResultChoreographyIds(
    rows.map((row) => row.choreographyId),
  );
  const publishedRows = rows.filter((row) =>
    publishedIds.has(row.choreographyId),
  );
  const results = await readPresentationResults(
    publishedRows.map((row) => row.choreographyId),
  );

  return {
    hasActiveEvent: true,
    rows: publishedRows.map((row) => {
      const result = results.get(row.choreographyId);

      return {
        ...row,
        academyName: academy.name,
        average: result?.average ?? null,
        award: result?.award ?? null,
        disqualified: result?.disqualified ?? false,
      };
    }),
  };
}
