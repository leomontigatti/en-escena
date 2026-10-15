import { and, asc, eq, inArray, or } from "drizzle-orm";

import type { db } from "@/db";
import { academies, seminarInscriptions } from "@/db/schema";
import {
  listIndividualsLinkedRosterRows,
  listRosterRowsLinkedIndividuals,
} from "@/lib/individuals/link.server";
import type { InscriptionPersonKind } from "@/lib/roster/roster-person-kind.shared";
import { seminarInscriptionPersonColumn } from "@/lib/roster/roster-person-kind.server";
import { activeSeminarInscription } from "@/lib/seminars/active-inscription";
import { seminarInscriptionPerson } from "@/lib/seminars/inscription-person.server";
import {
  registeredAsIndividualMessage,
  registeredByAcademyMessage,
} from "@/lib/seminars/registration-refusals";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type LinkedPersonRefusalCode =
  /** The individual's link reaches a row an academy registered. */
  | "registered-by-academy"
  /** The row is reached by an individual that registered itself. */
  | "registered-as-individual";

/**
 * One person, one inscription per seminar, whichever side registered it
 * (ADR-0019). Both directions read through the link module, so nothing is
 * refused before administration confirms the link, and a row the link reaches
 * counts whatever its `Estado de alta`. Only inscriptions on the roster refuse:
 * a withdrawn one holds money, not a place. Duplicates made before the link
 * was confirmed are administration's to remove.
 *
 * It runs under the seminar's lock, which both sides' registration takes, so
 * two registrations of the same person from either side are serialised.
 */
export async function findLinkedPersonRefusal(
  tx: Transaction,
  input: {
    personId: string;
    personKind: InscriptionPersonKind;
    seminarId: string;
  },
): Promise<{ code: LinkedPersonRefusalCode; error: string } | null> {
  if (input.personKind === "individual") {
    const academyName = await findAcademyRegistrationOfLinkedRow(tx, {
      individualId: input.personId,
      seminarId: input.seminarId,
    });

    return academyName === null
      ? null
      : {
          code: "registered-by-academy",
          error: registeredByAcademyMessage(academyName),
        };
  }

  const links = await listRosterRowsLinkedIndividuals(
    [{ id: input.personId, kind: input.personKind }],
    tx,
  );

  if (links.length === 0) {
    return null;
  }

  const [held] = await tx
    .select({ id: seminarInscriptions.id })
    .from(seminarInscriptions)
    .where(
      and(
        eq(seminarInscriptions.seminarId, input.seminarId),
        inArray(
          seminarInscriptions.individualId,
          links.map((link) => link.individualId),
        ),
        activeSeminarInscription(),
      ),
    )
    .limit(1);

  return held
    ? { code: "registered-as-individual", error: registeredAsIndividualMessage }
    : null;
}

/** The academy that holds an inscription in the seminar for a row the
 * individual's link reaches, the first by name when there are several. */
async function findAcademyRegistrationOfLinkedRow(
  tx: Transaction,
  input: { individualId: string; seminarId: string },
): Promise<string | null> {
  const links = await listIndividualsLinkedRosterRows([input.individualId], tx);

  if (links.length === 0) {
    return null;
  }

  const [held] = await tx
    .select({ academyName: academies.name })
    .from(seminarInscriptions)
    .innerJoin(
      seminarInscriptionPerson,
      eq(seminarInscriptionPerson.inscriptionId, seminarInscriptions.id),
    )
    .innerJoin(academies, eq(academies.id, seminarInscriptionPerson.academyId))
    .where(
      and(
        eq(seminarInscriptions.seminarId, input.seminarId),
        activeSeminarInscription(),
        or(
          ...links.map((link) =>
            eq(
              seminarInscriptionPersonColumn(link.rosterRowKind),
              link.rosterRowId,
            ),
          ),
        ),
      ),
    )
    .orderBy(asc(academies.name))
    .limit(1);

  return held?.academyName ?? null;
}
