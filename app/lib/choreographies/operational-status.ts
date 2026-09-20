export type ChoreographyOperationalPendingItem =
  "music" | "experienceLevel" | "professors";

export type ChoreographyOperationalStatus = {
  code: "complete" | "incomplete";
  pendingItems: ChoreographyOperationalPendingItem[];
};

export function deriveChoreographyOperationalStatus(input: {
  experienceLevelId: string | null;
  hasMusic: boolean;
  hasProfessors: boolean;
  requiresExperienceLevel: boolean;
}): ChoreographyOperationalStatus {
  const pendingItems: ChoreographyOperationalPendingItem[] = [];

  if (!input.hasMusic) {
    pendingItems.push("music");
  }

  // No category branch: a choreography always has one, so the only thing the
  // level check needs is whether the category it already has declares levels.
  if (input.requiresExperienceLevel && input.experienceLevelId === null) {
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
