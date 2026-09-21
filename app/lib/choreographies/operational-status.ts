/**
 * What the choreography does not have yet. These are the only items the portal
 * renders, and it renders them under a single `Falta cargar …` frame, so each
 * label below is written to complete that sentence.
 */
export type ChoreographyMissingPendingItem =
  "music" | "experienceLevel" | "professors";

/**
 * What the choreography has wrong: a stored placement the category it sits in no
 * longer admits. Nothing is missing, so these do not fit the portal's frame — and
 * the portal is not told about them anyway, since an academy has no lever to fix
 * one. The admin surfaces word each of them itself, which is why there is no
 * label function for this half of the union.
 */
export type ChoreographyMisfiledPendingItem =
  "categoryAgeMismatch" | "experienceLevelMismatch";

export type ChoreographyOperationalPendingItem =
  ChoreographyMissingPendingItem | ChoreographyMisfiledPendingItem;

export type ChoreographyOperationalStatus = {
  code: "complete" | "incomplete";
  pendingItems: ChoreographyOperationalPendingItem[];
};

/**
 * Everything the two mismatch clauses need to re-validate a stored placement: the
 * age the choreography was filed under, and the bounds its category admits today.
 * Handed in only by the surfaces that do that re-validation — the admin ones.
 * `null` turns both clauses off: the portal derives the same status, and an
 * academy has no lever to fix a mis-filed placement, so telling it produces a
 * phone call and not a repair.
 */
export type ChoreographyCategoryPlacementCheck = {
  /**
   * The age the choreography was filed under. `null` when the group-tolerance
   * branch placed it: that branch never required containment, so there is no
   * stored age to re-check and the clause stays silent.
   */
  categoryAgeBasis: number | null;
  categoryMaxAge: number;
  categoryMinAge: number;
};

export function deriveChoreographyOperationalStatus(input: {
  categoryExperienceLevels: string[];
  experienceLevelId: string | null;
  hasMusic: boolean;
  hasProfessors: boolean;
  placementCheck: ChoreographyCategoryPlacementCheck | null;
}): ChoreographyOperationalStatus {
  const pendingItems: ChoreographyOperationalPendingItem[] = [];

  if (!input.hasMusic) {
    pendingItems.push("music");
  }

  // No category branch: a choreography always has one, so the only thing the
  // level check needs is whether the category it already has declares levels.
  if (
    input.categoryExperienceLevels.length > 0 &&
    input.experienceLevelId === null
  ) {
    pendingItems.push("experienceLevel");
  }

  if (!input.hasProfessors) {
    pendingItems.push("professors");
  }

  // Validity, not optimality: what is asked is whether the stored placement is
  // still legal where it sits, not whether the resolver would pick this category
  // today. A choreography that still fits is not on the admin's fix list.
  if (input.placementCheck !== null) {
    if (isCategoryAgeMismatch(input.placementCheck)) {
      pendingItems.push("categoryAgeMismatch");
    }

    if (
      input.experienceLevelId !== null &&
      !input.categoryExperienceLevels.includes(input.experienceLevelId)
    ) {
      pendingItems.push("experienceLevelMismatch");
    }
  }

  return {
    code: pendingItems.length === 0 ? "complete" : "incomplete",
    pendingItems,
  };
}

function isCategoryAgeMismatch(
  placementCheck: ChoreographyCategoryPlacementCheck,
) {
  const { categoryAgeBasis } = placementCheck;

  if (categoryAgeBasis === null) {
    return false;
  }

  return (
    categoryAgeBasis < placementCheck.categoryMinAge ||
    categoryAgeBasis > placementCheck.categoryMaxAge
  );
}

export function isChoreographyMissingPendingItem(
  pendingItem: ChoreographyOperationalPendingItem,
): pendingItem is ChoreographyMissingPendingItem {
  return (
    pendingItem === "music" ||
    pendingItem === "experienceLevel" ||
    pendingItem === "professors"
  );
}

export function formatChoreographyOperationalPendingItemLabel(
  pendingItem: ChoreographyMissingPendingItem,
) {
  switch (pendingItem) {
    case "music":
      return "Música";
    case "experienceLevel":
      return "Nivel de experiencia";
    case "professors":
      return "Profesores";
  }
}

export function formatChoreographyOperationalStatusLabel(
  operationalStatus: ChoreographyOperationalStatus,
) {
  if (operationalStatus.code === "complete") {
    return "Completa";
  }

  return "Incompleta";
}

export function getChoreographyOperationalStatusBadgeVariant(
  operationalStatus: ChoreographyOperationalStatus,
) {
  return operationalStatus.code === "complete" ? "success" : "warning";
}
