import { requireAcademyUser } from "@/lib/auth/internal-access.server";
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

export type PortalPresentationsLoaderData = {
  hasActiveEvent: boolean;
  /** Whether the event has any presentation at all, its own empty state. */
  isEventOrdered: boolean;
  /** The header action to the full program follows it. */
  programVisible: boolean;
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

  return {
    hasActiveEvent: true,
    isEventOrdered,
    programVisible,
    rows: rows.map((row) => ({ ...row, academyName: academy.name })),
  };
}
