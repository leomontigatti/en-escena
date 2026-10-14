import { experienceLevelDisplayLabel } from "@/lib/choreographies/experience-level-requirement";
import type { JudgePresentationRow } from "@/lib/judging/judge-list.server";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

/**
 * How a presentation's scoring pages name it, the judge's forms and the admin's
 * scores page alike: `Luna de Papel · N.º 1`, and under it everything the list
 * row said, so whoever opened it can check it is the dance they meant.
 */
type PresentationHeading = Pick<
  JudgePresentationRow,
  | "academyName"
  | "categoryName"
  | "experienceLevel"
  | "experienceLevelRequirement"
  | "groupType"
  | "modalityName"
  | "name"
  | "orderNumber"
  | "submodalityName"
>;

export function formatPresentationTitle(presentation: PresentationHeading) {
  return `${presentation.name} · N.º ${presentation.orderNumber}`;
}

/**
 * `Academia Sur · Jazz / Lírico · Juvenil / Solo · Profesional`. Each pair the
 * list shows in one column is joined with a slash, so the dots only separate
 * columns; a missing submodality is left out, and an empty level is worded by
 * why it is empty (`Sin asignar`, `Sin nivel`, `No aplica`).
 */
export function formatPresentationSummary(presentation: PresentationHeading) {
  return [
    presentation.academyName,
    [presentation.modalityName, presentation.submodalityName]
      .filter(Boolean)
      .join(" / "),
    `${presentation.categoryName} / ${formatGroupTypeLabel(presentation.groupType)}`,
    experienceLevelDisplayLabel(
      presentation.experienceLevel,
      presentation.experienceLevelRequirement,
    ),
  ]
    .filter(Boolean)
    .join(" · ");
}
