import { slugify } from "@/lib/shared/slugify";

import type {
  CertificateRecipient,
  ChoreographyCertificates,
} from "./certificates.server";
import { renderCertificatesPdf } from "./pdf.server";

/**
 * The PDF a surface answers with, opened in the browser rather than saved: a
 * phone opens or downloads it, a computer shows it in its viewer, where it
 * prints. One recipient names the file after the dancer.
 */
export async function certificatesPdfResponse(
  certificates: ChoreographyCertificates,
  recipients: CertificateRecipient[],
): Promise<Response> {
  const choreographySlug = slugify(certificates.choreographyName);
  const fileName =
    recipients.length === 1
      ? `certificado-${slugify(recipients[0].name)}-${choreographySlug}.pdf`
      : `certificados-${choreographySlug}.pdf`;
  const bytes = await renderCertificatesPdf({
    certificates: recipients.map((recipient) => ({
      award: certificates.award,
      choreographyName: certificates.choreographyName,
      dancerName: recipient.name,
    })),
    template: certificates.template,
    title: `Certificados · ${certificates.choreographyName}`,
  });

  return new Response(bytes, {
    headers: {
      // Dancers' names: kept off shared caches and out of the browser's, as
      // the other personal downloads are.
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Content-Type": "application/pdf",
    },
  });
}
