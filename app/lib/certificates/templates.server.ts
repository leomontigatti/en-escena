import { awardLabels, type Award } from "@/lib/judging/award";
import { BUSINESS_TIME_ZONE } from "@/lib/shared/business-time-zone";

import { parseCertificateArtwork, type CertificateArtwork } from "./artwork";
import type { CertificateBodyFrame, CertificateRun } from "./body-layout";
import artwork2026 from "./template-2026.svg?raw";

/**
 * A `certificate` is drawn on one edition's template: the designer's artwork
 * with its sentence taken out, the frame the sentence goes back into, and the
 * sentence itself, whose edition, city and dates are that year's. A year with
 * no template has no certificates, and the surfaces offer none.
 *
 * A new edition: export the designer's SVG with the body text as a path named
 * `texto`, remove that path, save it beside this file and add its year here.
 */

/** What one certificate fills in. */
export type CertificateFields = {
  award: Award;
  choreographyName: string;
  dancerName: string;
};

export type CertificateTemplate = {
  artwork: CertificateArtwork;
  body: CertificateBodyFrame & { color: string };
  sentence: (fields: CertificateFields) => CertificateRun[];
  year: number;
};

const templates: Record<number, () => CertificateTemplate> = {
  2026: () => ({
    artwork: parseCertificateArtwork(artwork2026),
    // Where the designer's four lines of Montserrat sat: the frame spans the
    // width they used, centred on the page, and their height, which ends just
    // above the right-hand signature.
    body: {
      color: "#0d3a3a",
      fontSize: 83,
      height: 415,
      left: 231,
      lineHeight: 1.25,
      top: 999,
      width: 3046,
    },
    sentence: ({ award, choreographyName, dancerName }) => [
      { text: "Certificamos que ", weight: "regular" },
      { text: dancerName, weight: "bold" },
      {
        text: " ha participado en la 5ta edición del Certamen de Danzas “En Escena”, llevado a cabo en la ciudad de Villa Carlos Paz, Córdoba; los días 10, 17, 21, 22, 23, 24 y 25 de Octubre de 2026 obteniendo el premio ",
        weight: "regular",
      },
      { text: awardLabels[award], weight: "bold" },
      { text: " por la obra ", weight: "regular" },
      { text: `“${choreographyName}”`, weight: "bold" },
      { text: ".", weight: "regular" },
    ],
    year: 2026,
  }),
};

const loaded = new Map<number, CertificateTemplate>();

const yearFormat = new Intl.DateTimeFormat("en", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
});

export function certificateTemplateForEvent(
  startsAt: Date,
): CertificateTemplate | null {
  const year = Number(yearFormat.format(startsAt));
  const build = templates[year];

  if (!build) {
    return null;
  }

  let template = loaded.get(year);

  if (!template) {
    template = build();
    loaded.set(year, template);
  }

  return template;
}
