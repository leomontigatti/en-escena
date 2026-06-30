import type { ChoreographyOperationalStatus } from "@/lib/choreographies/operational-status";

export type { ChoreographyOperationalStatus } from "@/lib/choreographies/operational-status";
export { formatChoreographyOperationalStatusLabel as formatOperationalStatusLabel } from "@/lib/choreographies/operational-status";

export type ChoreographyGroupType = "solo" | "duo" | "trio" | "grupal";

export type ChoreographyListItem = {
  id: string;
  name: string;
  modalityName: string;
  submodalityName: string | null;
  groupType: ChoreographyGroupType;
  categoryName: string | null;
  experienceLevelName: string | null;
  musicStorageKey?: string | null;
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
