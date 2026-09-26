import { and, asc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  academies,
  choreographies,
  comprobantes,
  dancers,
  paymentAllocations,
  payments,
  professors,
  user,
} from "@/db/schema";
import { formatSpanishList } from "@/lib/shared/text-normalization";

import type {
  AcademyMergeCandidate,
  AcademyMergeHoldings,
} from "./academy-merge.shared";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type MergeAcademiesResult =
  | { ok: true; survivor: { id: string; name: string } }
  | { ok: false; message: string };

/**
 * `mergeAcademies` —ui: "Fusionar"— folds an academy that forked at signup into
 * the one that stays (PRD #1187). Everything the removed academy holds moves to
 * the survivor: its dancers and professors (and with them their seminar
 * inscriptions, which carry no academy of their own), its choreographies, its
 * payments and their allocations. Then the removed academy's user is deleted,
 * which cascades the now-empty academy, so the second login stops working and
 * cannot fork again.
 *
 * Two refusals, both read inside the transaction. A comprobante names its
 * academy and is immutable, so an academy with any cannot go. A document number
 * on both rosters would break the roster's document rule the moment the people
 * met in one academy; the operator clears one document of each pair first.
 */
export async function mergeAcademies(input: {
  removedId: string;
  survivorId: string;
}): Promise<MergeAcademiesResult> {
  if (input.removedId === input.survivorId) {
    return { ok: false, message: "Elegí otra academia para fusionar." };
  }

  return await db.transaction(async (tx) => {
    // Ordered by id, so two merges over the same pair lock in the same order.
    const locked = await tx
      .select({
        id: academies.id,
        name: academies.name,
        userId: academies.userId,
      })
      .from(academies)
      .where(inArray(academies.id, [input.removedId, input.survivorId]))
      .orderBy(asc(academies.id))
      .for("update");
    const removed = locked.find((academy) => academy.id === input.removedId);
    const survivor = locked.find((academy) => academy.id === input.survivorId);

    if (!removed) {
      throw new Response("No encontramos esa Academia.", { status: 404 });
    }

    if (!survivor) {
      return {
        ok: false,
        message: "No encontramos la academia que queda. Elegí otra academia.",
      };
    }

    const comprobanteCount = await tx.$count(
      comprobantes,
      eq(comprobantes.academyId, removed.id),
    );

    if (comprobanteCount > 0) {
      return {
        ok: false,
        message: `No se puede fusionar: ${removed.name} tiene comprobantes emitidos, y un comprobante no cambia de academia.`,
      };
    }

    const collisions = await findDocumentCollisions(tx, input);

    if (collisions.length > 0) {
      return {
        ok: false,
        message: `No se puede fusionar: estos documentos están en las dos academias: ${formatSpanishList(
          collisions,
        )}. Quitá el documento de uno de cada par antes de fusionar.`,
      };
    }

    const moveTo = { academyId: survivor.id };

    await tx
      .update(dancers)
      .set(moveTo)
      .where(eq(dancers.academyId, removed.id));
    await tx
      .update(professors)
      .set(moveTo)
      .where(eq(professors.academyId, removed.id));
    await tx
      .update(choreographies)
      .set(moveTo)
      .where(eq(choreographies.academyId, removed.id));
    await tx
      .update(payments)
      .set(moveTo)
      .where(eq(payments.academyId, removed.id));
    await tx
      .update(paymentAllocations)
      .set(moveTo)
      .where(eq(paymentAllocations.academyId, removed.id));
    await tx.delete(user).where(eq(user.id, removed.userId));

    return { ok: true, survivor: { id: survivor.id, name: survivor.name } };
  });
}

/**
 * What the merge dialog offers and counts for one academy: every other
 * academy, and what this one holds.
 */
export async function loadAcademyMergeOptions(academyId: string): Promise<{
  candidates: AcademyMergeCandidate[];
  holdings: AcademyMergeHoldings;
}> {
  const [
    candidates,
    choreographyCount,
    comprobanteCount,
    dancerCount,
    paymentCount,
    professorCount,
  ] = await Promise.all([
    db
      .select({ email: user.email, id: academies.id, name: academies.name })
      .from(academies)
      .innerJoin(user, eq(user.id, academies.userId))
      .where(ne(academies.id, academyId))
      .orderBy(asc(academies.name)),
    db.$count(choreographies, eq(choreographies.academyId, academyId)),
    db.$count(comprobantes, eq(comprobantes.academyId, academyId)),
    db.$count(dancers, eq(dancers.academyId, academyId)),
    db.$count(payments, eq(payments.academyId, academyId)),
    db.$count(professors, eq(professors.academyId, academyId)),
  ]);

  return {
    candidates,
    holdings: {
      choreographies: choreographyCount,
      comprobantes: comprobanteCount,
      dancers: dancerCount,
      payments: paymentCount,
      professors: professorCount,
    },
  };
}

/**
 * The document numbers held on both rosters, per table: a dancer and a
 * professor never collide, since the rule never crosses the two tables.
 */
async function findDocumentCollisions(
  tx: Transaction,
  input: { removedId: string; survivorId: string },
) {
  const survivorDancer = alias(dancers, "survivor_dancer");
  const survivorProfessor = alias(professors, "survivor_professor");
  const [dancerPairs, professorPairs] = await Promise.all([
    tx
      .select({
        documentNumber: dancers.documentNumber,
        removedFirstName: dancers.firstName,
        removedLastName: dancers.lastName,
        survivorFirstName: survivorDancer.firstName,
        survivorLastName: survivorDancer.lastName,
      })
      .from(dancers)
      .innerJoin(
        survivorDancer,
        eq(survivorDancer.documentNumber, dancers.documentNumber),
      )
      .where(
        and(
          eq(dancers.academyId, input.removedId),
          eq(survivorDancer.academyId, input.survivorId),
          isNotNull(dancers.documentNumber),
        ),
      )
      .orderBy(asc(dancers.documentNumber)),
    tx
      .select({
        documentNumber: professors.documentNumber,
        removedFirstName: professors.firstName,
        removedLastName: professors.lastName,
        survivorFirstName: survivorProfessor.firstName,
        survivorLastName: survivorProfessor.lastName,
      })
      .from(professors)
      .innerJoin(
        survivorProfessor,
        eq(survivorProfessor.documentNumber, professors.documentNumber),
      )
      .where(
        and(
          eq(professors.academyId, input.removedId),
          eq(survivorProfessor.academyId, input.survivorId),
          isNotNull(professors.documentNumber),
        ),
      )
      .orderBy(asc(professors.documentNumber)),
  ]);

  return [
    ...dancerPairs.map((pair) => describePair("bailarín", pair)),
    ...professorPairs.map((pair) => describePair("profesor", pair)),
  ];
}

function describePair(
  kind: string,
  pair: {
    documentNumber: string | null;
    removedFirstName: string;
    removedLastName: string;
    survivorFirstName: string;
    survivorLastName: string;
  },
) {
  return `${kind} ${pair.removedFirstName} ${pair.removedLastName} y ${pair.survivorFirstName} ${pair.survivorLastName} (${pair.documentNumber})`;
}
