import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, choreographyDancers, dancers } from "@/db/schema";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";

export async function loadAdministrativeChoreographyFinanceDetail(input: {
  params: { academyId?: string; choreographyId?: string };
  request: Request;
}) {
  await requireInternalUser(input.request, ["admin", "auditor"]);

  const academyId = readAcademyId(input.params);
  const choreographyId = readChoreographyId(input.params);
  const [academy, eventContext] = await Promise.all([
    readAcademy(academyId),
    loadAdminEventContext(input.request),
  ]);

  if (eventContext.selectedEventId === null) {
    return {
      academy,
      choreography: null,
      participations: [],
      selectedEventId: null,
    };
  }

  const financeDetail = await readAcademyEventOperationalFinanceDetail({
    academyId,
    eventId: eventContext.selectedEventId,
  });
  const choreographyFinanceRow = financeDetail.choreographyFinanceRows.find(
    (row) => row.id === choreographyId,
  );

  if (!choreographyFinanceRow) {
    throw new Response("No encontramos esa coreografía.", { status: 404 });
  }

  const inscriptionsById = new Map(
    financeDetail.inscriptions
      .filter((inscription) => inscription.choreographyId === choreographyId)
      .map((inscription) => [inscription.dancerId, inscription]),
  );
  const participationRows = await listChoreographyParticipationRows({
    choreographyId,
  });

  return {
    academy,
    choreography: {
      depositAmount: choreographyFinanceRow.depositAmount,
      depositCompletedOn: choreographyFinanceRow.depositCompletedOn,
      financialState: choreographyFinanceRow.financialState,
      groupType: choreographyFinanceRow.groupType,
      id: choreographyFinanceRow.id,
      name: choreographyFinanceRow.name,
      needsAttention: choreographyFinanceRow.needsAttention,
      owedAmount: choreographyFinanceRow.owedAmount,
      paidAmount: choreographyFinanceRow.paidAmount,
    },
    participations: participationRows.map((participation) => {
      const inscription = inscriptionsById.get(participation.dancerId);

      return {
        ...participation,
        basePriceAmount: inscription?.basePriceAmount ?? null,
        discountAmount: inscription?.dancerDiscountAmount ?? 0,
        finalPriceAmount: inscription?.finalPriceAmount ?? null,
      };
    }),
    selectedEventId: eventContext.selectedEventId,
  };
}

async function readAcademy(academyId: string) {
  const academy = await db.query.academies.findFirst({
    columns: {
      contactName: true,
      id: true,
      name: true,
      phone: true,
    },
    where: eq(academies.id, academyId),
  });

  if (!academy) {
    throw new Response("No encontramos esa academia.", { status: 404 });
  }

  return academy;
}

async function listChoreographyParticipationRows(input: {
  choreographyId: string;
}) {
  return await db
    .select({
      dancerId: dancers.id,
      firstName: dancers.firstName,
      lastName: dancers.lastName,
    })
    .from(choreographyDancers)
    .innerJoin(dancers, eq(choreographyDancers.dancerId, dancers.id))
    .where(eq(choreographyDancers.choreographyId, input.choreographyId))
    .orderBy(asc(dancers.lastName), asc(dancers.firstName));
}

function readAcademyId(params: { academyId?: string }) {
  if (!params.academyId) {
    throw new Response("No encontramos esa academia.", { status: 404 });
  }

  return params.academyId;
}

function readChoreographyId(params: { choreographyId?: string }) {
  if (!params.choreographyId) {
    throw new Response("No encontramos esa coreografía.", { status: 404 });
  }

  return params.choreographyId;
}
