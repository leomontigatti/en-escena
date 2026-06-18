export type ChoreographyOperationalPendingItem =
  | "music"
  | "category"
  | "experienceLevel"
  | "professors";

export type ChoreographyOperationalStatus = {
  code: "complete" | "incomplete";
  pendingItems: ChoreographyOperationalPendingItem[];
};

export type ChoreographyGroupType = "solo" | "duo" | "trio" | "grupal";

export type ChoreographyListItem = {
  id: string;
  name: string;
  modalityName: string;
  submodalityName: string | null;
  groupType: ChoreographyGroupType;
  categoryName: string | null;
  experienceLevelName: string | null;
  operationalStatus: ChoreographyOperationalStatus;
};

export function formatGroupTypeLabel(groupType: ChoreographyGroupType) {
  switch (groupType) {
    case "solo":
      return "Solo";
    case "duo":
      return "Dúo";
    case "trio":
      return "Trío";
    case "grupal":
      return "Grupal";
  }
}

export function formatOperationalPendingItemLabel(
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

export function formatOperationalStatusLabel(
  operationalStatus: ChoreographyOperationalStatus,
) {
  if (operationalStatus.code === "complete") {
    return "Completa";
  }

  return "Incompleta";
}
