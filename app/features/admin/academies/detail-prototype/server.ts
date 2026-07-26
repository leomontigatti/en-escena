// PROTOTIPO — descartable. Ver issue #488.
//
// Loader único que alimenta las tres variantes del detalle de academia.
// Trae de más a propósito: cada variante usa el subconjunto que necesita, y
// así se ve qué datos hacen falta de verdad antes de escribir el loader real.

import { and, asc, count, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, choreographyDancers, dancers, user } from "@/db/schema";
import { loadAdministrativeAcademyFinanceDetail } from "@/features/admin/finances/academy-detail/server";

export async function loadAcademyDetailPrototype(input: {
  params: { academyId?: string };
  request: Request;
}) {
  // Reusa permisos, contexto de evento, 404 y todo el cálculo financiero.
  const finance = await loadAdministrativeAcademyFinanceDetail(input);
  const academyId = finance.academy.id;

  const [contact, dancerRows] = await Promise.all([
    readAcademyContact(academyId),
    readAcademyDancers(academyId),
  ]);

  const choreographies = finance.choreographyFinanceRows;

  return {
    academy: {
      ...finance.academy,
      createdAt: contact?.createdAt ?? null,
      email: contact?.email ?? null,
    },
    choreographies,
    dancers: dancerRows,
    selectedEventId: finance.selectedEventId,
    summary: finance.summary,
    counts: {
      choreographies: choreographies.length,
      dancers: dancerRows.length,
      inscriptions: choreographies.reduce(
        (total, row) => total + row.registrationCount,
        0,
      ),
      unpaidChoreographies: choreographies.filter(
        (row) => row.financialState === "impaga",
      ).length,
      unverifiedDancers: dancerRows.filter((row) => !row.identityVerified)
        .length,
    },
  };
}

async function readAcademyContact(academyId: string) {
  const [row] = await db
    .select({
      createdAt: academies.createdAt,
      email: user.email,
    })
    .from(academies)
    .innerJoin(user, eq(academies.userId, user.id))
    .where(eq(academies.id, academyId))
    .limit(1);

  return row ?? null;
}

async function readAcademyDancers(academyId: string) {
  const rows = await db
    .select({
      active: dancers.active,
      birthDate: dancers.birthDate,
      documentNumber: dancers.documentNumber,
      firstName: dancers.firstName,
      id: dancers.id,
      identityVerifiedAt: dancers.identityVerifiedAt,
      inscriptionCount: count(choreographyDancers.id),
      lastName: dancers.lastName,
    })
    .from(dancers)
    .leftJoin(choreographyDancers, eq(choreographyDancers.dancerId, dancers.id))
    .where(and(eq(dancers.academyId, academyId)))
    .groupBy(dancers.id)
    .orderBy(asc(dancers.lastName), asc(dancers.firstName));

  return rows.map((row) => ({
    ...row,
    fullName: `${row.firstName} ${row.lastName}`,
    identityVerified: row.identityVerifiedAt !== null,
  }));
}

export type AcademyDetailPrototypeLoaderData = Awaited<
  ReturnType<typeof loadAcademyDetailPrototype>
>;
