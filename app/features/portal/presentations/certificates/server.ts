import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  readChoreographyCertificates,
  type ChoreographyCertificates,
} from "@/lib/certificates/certificates.server";
import { certificatesPdfResponse } from "@/lib/certificates/response.server";
import { getPortalActiveEventSummaryContext } from "@/lib/portal/event-context.server";
import { readRequestedUrl } from "@/lib/shared/requested-url.server";

import { certificateDancerParam } from "./shared";

/**
 * `Descargar certificados` on the academy's evaluation detail: every dancer's
 * `certificate` in one PDF, or one dancer's when the address names it. The
 * academy reaches only its own choreographies of its active event, and only
 * what the evaluation detail offers; anything else answers "not found", as the
 * evaluation does.
 */
export async function loadPortalCertificates(input: {
  params: { choreographyId?: string };
  request: Request;
}): Promise<Response> {
  const certificates = await readAcademyChoreographyCertificates(input);
  const dancerId = readRequestedUrl(input.request).searchParams.get(
    certificateDancerParam,
  );
  const recipients = dancerId
    ? certificates.recipients.filter(
        (recipient) => recipient.dancerId === dancerId,
      )
    : certificates.recipients;

  if (recipients.length === 0) {
    throw notFound();
  }

  return await certificatesPdfResponse(certificates, recipients);
}

async function readAcademyChoreographyCertificates(input: {
  params: { choreographyId?: string };
  request: Request;
}): Promise<ChoreographyCertificates> {
  const { academy } = await requireAcademyUser(input.request);
  const { activeEvent } = await getPortalActiveEventSummaryContext(
    input.request,
  );
  const certificates = await readChoreographyCertificates(
    input.params.choreographyId ?? "",
  );

  if (
    !certificates ||
    !activeEvent ||
    certificates.eventId !== activeEvent.id ||
    certificates.academyId !== academy.id
  ) {
    throw notFound();
  }

  return certificates;
}

function notFound() {
  return new Response("No se encontraron los certificados buscados.", {
    status: 404,
  });
}
