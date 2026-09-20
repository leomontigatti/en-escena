export type ChoreographyOperationalPendingItem =
  | "music"
  | "experienceLevel"
  | "professors"
  | "categoryAgeMismatch"
  | "experienceLevelMismatch";

export type ChoreographyOperationalStatus = {
  code: "complete" | "incomplete";
  pendingItems: ChoreographyOperationalPendingItem[];
};

/**
 * The category's own bounds, handed in only by the surfaces that re-validate the
 * stored placement — the admin ones. `null` turns both mismatch clauses off: the
 * portal derives the same status, and an academy has no lever to fix a mis-filed
 * placement, so telling it produces a phone call and not a repair.
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

export function formatChoreographyOperationalPendingItemLabel(
  pendingItem: ChoreographyOperationalPendingItem,
) {
  switch (pendingItem) {
    case "music":
      return "Música";
    case "experienceLevel":
      return "Nivel de experiencia";
    case "professors":
      return "Profesores";
    case "categoryAgeMismatch":
      return "Categoría fuera del rango de edad";
    case "experienceLevelMismatch":
      return "Nivel de experiencia ajeno a la categoría";
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
