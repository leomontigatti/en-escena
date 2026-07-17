import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { emptyOperationalFinanceSummary } from "@/lib/finances/operational-summary";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

export async function loadAdministrativeAcademyAccountCurrent(input: {
  params: { academyId?: string };
  request: Request;
}) {
  await requireInternalUser(input.request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(input.request);
  const academy = await readAcademy(readAcademyId(input.params));

  const financeDetail =
    eventContext.selectedEventId === null
      ? {
          choreographyFinanceRows: [],
          summary: emptyOperationalFinanceSummary(),
        }
      : await readAcademyEventOperationalFinanceDetail({
          academyId: academy.id,
          eventId: eventContext.selectedEventId,
        });

  return {
    academy,
    choreographyFinanceRows: financeDetail.choreographyFinanceRows,
    selectedEventId: eventContext.selectedEventId,
    summary: financeDetail.summary,
  };
}

async function readAcademy(academyId: string) {
  const academy = await db.query.academies.findFirst({
    columns: {
      id: true,
      name: true,
      contactName: true,
      phone: true,
    },
    where: eq(academies.id, academyId),
  });

  if (!academy) {
    throw new Response("No encontramos esa academia.", { status: 404 });
  }

  return academy;
}

function readAcademyId(params: { academyId?: string }) {
  if (!params.academyId) {
    throw new Response("No encontramos esa academia.", { status: 404 });
  }

  return params.academyId;
}
