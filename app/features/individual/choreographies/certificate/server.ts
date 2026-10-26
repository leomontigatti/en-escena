import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { events } from "@/db/schema";
import { requireIndividualUser } from "@/lib/auth/internal-access.server";
import {
  readChoreographyCertificates,
  type CertificateRecipient,
  type ChoreographyCertificates,
} from "@/lib/certificates/certificates.server";
import { certificatesPdfResponse } from "@/lib/certificates/response.server";
import { listIndividualLinkedRosterRows } from "@/lib/individuals/link.server";

/**
 * An individual's own `certificate` (ADR-0019): for a choreography of the
 * active event that issues them, the one that goes to a dancer row its link
 * reaches. It is the academy's certificate for that row, name included, and
 * the individual reaches nothing else of the choreography's.
 */

/**
 * The choreography's certificates and the recipients among `dancerIds`, the
 * rows the individual's link reaches; null when there are none for it.
 */
export async function readIndividualCertificates(input: {
  choreographyId: string;
  dancerIds: ReadonlySet<string>;
  eventId: string;
}): Promise<{
  certificates: ChoreographyCertificates;
  recipients: CertificateRecipient[];
} | null> {
  // Reach is the recipients' filter below: a certificate goes to a dancer row
  // the link reaches, so the choreography needs no list of its own.
  const certificates = await readChoreographyCertificates(
    { kind: "individual" },
    input.choreographyId,
  );

  if (!certificates || certificates.eventId !== input.eventId) {
    return null;
  }

  const recipients = certificates.recipients.filter((recipient) =>
    input.dancerIds.has(recipient.dancerId),
  );

  return recipients.length === 0 ? null : { certificates, recipients };
}

export async function loadIndividualCertificate(input: {
  params: { choreographyId?: string };
  request: Request;
}): Promise<Response> {
  const { individual } = await requireIndividualUser(input.request);
  const activeEvent = await db.query.events.findFirst({
    columns: { id: true },
    where: eq(events.active, true),
    orderBy: [desc(events.startsAt)],
  });
  // As `Coreografías` reads them: a row its academy archived takes no part.
  const dancerIds = new Set(
    (await listIndividualLinkedRosterRows(individual))
      .filter((row) => row.kind === "dancer" && row.status === "active")
      .map((row) => row.id),
  );
  const found = activeEvent
    ? await readIndividualCertificates({
        choreographyId: input.params.choreographyId ?? "",
        dancerIds,
        eventId: activeEvent.id,
      })
    : null;

  if (!found) {
    throw new Response("No se encontró el certificado buscado.", {
      status: 404,
    });
  }

  return await certificatesPdfResponse(found.certificates, found.recipients);
}
