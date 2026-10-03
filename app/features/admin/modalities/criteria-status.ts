import {
  sheetGaps,
  sheetLevels,
  type OfferedSheets,
} from "@/lib/judging/sheet-criteria";

import type {
  EventSubmodalityCriterionRow,
  EventSubmodalityRow,
} from "./shared";

/**
 * Where a modality's criteria stand, as its page and the list tell it before a
 * judge finds out on the sheet: `none` while every submodality scores with a
 * single value, `incomplete` while some sheet misses 100, `complete` otherwise.
 * It counts the same sheets the criteria editor lists, so the two never
 * disagree about a submodality.
 */
export type ModalityCriteriaStatus = "none" | "incomplete" | "complete";

type ModalityCriteriaSetup = {
  /** The event's criteria; those of other modalities' submodalities are ignored. */
  criteria: readonly EventSubmodalityCriterionRow[];
  sheets: OfferedSheets;
  /** The submodalities of the one modality. */
  submodalities: readonly EventSubmodalityRow[];
};

/** The submodalities with a sheet short of 100, in the order they came. */
export function incompleteSubmodalities({
  criteria,
  sheets,
  submodalities,
}: ModalityCriteriaSetup): EventSubmodalityRow[] {
  return submodalities.filter((submodality) => {
    const own = criteria.filter(
      (criterion) => criterion.submodalityId === submodality.id,
    );

    return (
      sheetGaps(own, { ...sheets, levels: sheetLevels(own, sheets) }).length > 0
    );
  });
}

export function modalityCriteriaStatus(
  setup: ModalityCriteriaSetup,
): ModalityCriteriaStatus {
  if (incompleteSubmodalities(setup).length > 0) {
    return "incomplete";
  }

  const submodalityIds = new Set(
    setup.submodalities.map((submodality) => submodality.id),
  );

  return setup.criteria.some((criterion) =>
    submodalityIds.has(criterion.submodalityId),
  )
    ? "complete"
    : "none";
}
