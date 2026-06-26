export type ChoreographyOperationalPendingItem =
  | "music"
  | "category"
  | "experienceLevel"
  | "professors";

export type ChoreographyOperationalStatus = {
  code: "complete" | "incomplete";
  pendingItems: ChoreographyOperationalPendingItem[];
};

export function deriveChoreographyOperationalStatus(input: {
  categoryId: string | null;
  experienceLevelId: string | null;
  hasMusic: boolean;
  hasProfessors: boolean;
  requiresExperienceLevel: boolean;
}): ChoreographyOperationalStatus {
  const pendingItems: ChoreographyOperationalPendingItem[] = [];

  if (!input.hasMusic) {
    pendingItems.push("music");
  }

  if (input.categoryId === null) {
    pendingItems.push("category");
  }

  if (
    input.categoryId !== null &&
    input.requiresExperienceLevel &&
    input.experienceLevelId === null
  ) {
    pendingItems.push("experienceLevel");
  }

  if (!input.hasProfessors) {
    pendingItems.push("professors");
  }

  return {
    code: pendingItems.length === 0 ? "complete" : "incomplete",
    pendingItems,
  };
}

export function formatChoreographyOperationalPendingItemLabel(
  pendingItem: ChoreographyOperationalPendingItem,
) {
  switch (pendingItem) {
    case "music":
      return "Música";
    case "category":
      return "Categoría";
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
