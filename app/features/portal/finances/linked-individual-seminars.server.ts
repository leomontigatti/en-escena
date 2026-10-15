import {
  bySeminarSlot,
  linkedIndividualsOnlySeminarFinanceRow,
  type SeminarOperationalFinanceRow,
  withLinkedInscriptionsCounted,
} from "@/lib/finances/seminar-operational-summary.server";
import type { LinkedIndividualSeminarInscriptionRow } from "@/lib/seminars/linked-individual-inscriptions.server";

/** A row of the academy's `Seminarios` tab, flagged when only linked
 * individuals put the seminar there. */
export type PortalSeminarFinanceRow = SeminarOperationalFinanceRow & {
  linkedIndividualsOnly: boolean;
};

/**
 * The academy's seminar units plus one zero row for each seminar that only
 * its linked individuals are in (ADR-0019), so the academy reaches their rows
 * there too. The academy's own rows and the summary above them are read
 * without these, so the added rows change no figure. `Inscriptos` is the one
 * exception: it counts the linked individuals' inscriptions too, because it
 * counts the rows the seminar's detail lists, not what the academy pays for.
 */
export function withLinkedIndividualsOnlySeminars(input: {
  academyId: string;
  linkedInscriptions: readonly LinkedIndividualSeminarInscriptionRow[];
  seminarFinanceRows: readonly SeminarOperationalFinanceRow[];
}): PortalSeminarFinanceRow[] {
  const ownSeminarIds = new Set(input.seminarFinanceRows.map((row) => row.id));
  const linkedOnly = new Map<string, PortalSeminarFinanceRow>();

  for (const inscription of input.linkedInscriptions) {
    if (
      ownSeminarIds.has(inscription.seminarId) ||
      linkedOnly.has(inscription.seminarId)
    ) {
      continue;
    }

    linkedOnly.set(inscription.seminarId, {
      ...linkedIndividualsOnlySeminarFinanceRow({
        academyId: input.academyId,
        id: inscription.seminarId,
        instructorName: inscription.instructorName,
        scheduledDate: inscription.scheduledDate,
      }),
      linkedIndividualsOnly: true,
    });
  }

  return withLinkedInscriptionsCounted(
    [
      ...input.seminarFinanceRows.map((row) => ({
        ...row,
        linkedIndividualsOnly: false,
      })),
      ...linkedOnly.values(),
    ],
    input.linkedInscriptions,
  ).sort(bySeminarSlot);
}
