import type { ChoreographyOperationalStatus } from "@/lib/choreographies/operational-status";

export type { ChoreographyOperationalStatus } from "@/lib/choreographies/operational-status";
export { formatChoreographyOperationalStatusLabel as formatOperationalStatusLabel } from "@/lib/choreographies/operational-status";

export type ChoreographyGroupType = "solo" | "duo" | "trio" | "grupal";

export const choreographyGroupTypeOptions = [
  { value: "solo", label: "Solo" },
  { value: "duo", label: "Dúo" },
  { value: "trio", label: "Trío" },
  { value: "grupal", label: "Grupal" },
] as const satisfies ReadonlyArray<{
  value: ChoreographyGroupType;
  label: string;
}>;

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
  return (
    choreographyGroupTypeOptions.find((option) => option.value === groupType)
      ?.label ?? groupType
  );
}
