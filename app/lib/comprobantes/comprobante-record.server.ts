import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  choreographyDancers,
  comprobanteInscriptions,
  dancers,
  seminarInscriptions,
} from "@/db/schema";
import { formatDancerName } from "@/lib/finances/formatters";
import { seminarInscriptionPerson } from "@/lib/seminars/inscription-person.server";

import {
  readComprobanteAnchorContext,
  type ComprobanteAnchorContext,
} from "./anchor-context.server";
import {
  readComprobanteAssociation,
  type ComprobanteAssociation,
} from "./association";
import {
  listAnchorComprobantes,
  type ComprobanteWithLines,
} from "./comprobantes.server";

/**
 * One line as a surface shows it: `Inscripción — {bailarín}` at the amount
 * billed for that inscription (#657). The dancer is the one the inscription
 * names, so the receptor block's academy and unit are not repeated.
 */
export type ComprobanteLineDetail = {
  id: string;
  description: string;
  amount: number;
  // A withdrawn inscription still shows: the lines are what sums to the
  // authorized `impTotal` (#600).
  withdrawn: boolean;
};

/**
 * Everything the comprobante detail and its printed document read: the row
 * with its derived status, its anchor context, its lines as they are shown,
 * and the comprobante it is associated with, in either direction.
 */
export type ComprobanteRecord = {
  comprobante: ComprobanteWithLines;
  context: ComprobanteAnchorContext;
  lines: ComprobanteLineDetail[];
  association: ComprobanteAssociation | null;
};

/**
 * Loads one comprobante with its whole star: the status and the association
 * are both read over the anchor's comprobantes, which hold every note of its
 * invoice. `null` when it does not exist.
 */
export async function readComprobanteRecord(
  comprobanteId: string,
): Promise<ComprobanteRecord | null> {
  const context = await readComprobanteAnchorContext(comprobanteId);

  if (!context) {
    return null;
  }

  const [scope, lines] = await Promise.all([
    listAnchorComprobantes(context.anchor),
    readComprobanteLines(comprobanteId),
  ]);
  const comprobante = scope.find((row) => row.id === comprobanteId);

  if (!comprobante) {
    return null;
  }

  return {
    comprobante,
    context,
    lines,
    association: readComprobanteAssociation(comprobante, scope),
  };
}

/**
 * The lines of one comprobante in one query, each named by the person its
 * inscription is for, whichever of the two kinds it bills. A line names
 * exactly one inscription and neither reference is ever nulled, so the
 * `coalesce` is total.
 */
async function readComprobanteLines(
  comprobanteId: string,
): Promise<ComprobanteLineDetail[]> {
  // The subquery's columns qualified by hand: Drizzle renders an aliased
  // subquery column bare, and `first_name` would also match the dancer's.
  const person = (column: string) =>
    sql`${sql.identifier("seminar_inscription_person")}.${sql.identifier(column)}`;
  const firstName = sql<string>`coalesce(${dancers.firstName}, ${person("first_name")})`;
  const lastName = sql<string>`coalesce(${dancers.lastName}, ${person("last_name")})`;
  const rows = await db
    .select({
      id: comprobanteInscriptions.id,
      amount: comprobanteInscriptions.amount,
      firstName,
      lastName,
      withdrawn: sql<boolean>`coalesce(${choreographyDancers.withdrawnAt}, ${seminarInscriptions.withdrawnAt}) is not null`,
    })
    .from(comprobanteInscriptions)
    .leftJoin(
      choreographyDancers,
      eq(
        choreographyDancers.id,
        comprobanteInscriptions.choreographyInscriptionId,
      ),
    )
    .leftJoin(dancers, eq(dancers.id, choreographyDancers.dancerId))
    .leftJoin(
      seminarInscriptions,
      eq(seminarInscriptions.id, comprobanteInscriptions.seminarInscriptionId),
    )
    .leftJoin(
      seminarInscriptionPerson,
      eq(seminarInscriptionPerson.inscriptionId, seminarInscriptions.id),
    )
    .where(eq(comprobanteInscriptions.comprobanteId, comprobanteId))
    .orderBy(asc(lastName), asc(firstName), asc(comprobanteInscriptions.id));

  return rows.map((row) => ({
    id: row.id,
    description: `Inscripción — ${formatDancerName(row)}`,
    amount: row.amount,
    withdrawn: row.withdrawn,
  }));
}
