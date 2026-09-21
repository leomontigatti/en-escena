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

export type PortalChoreographyListItem = {
  id: string;
  choreographyNumber: number;
  name: string;
  modalityName: string;
  submodalityName: string | null;
  groupType: ChoreographyGroupType;
  categoryName: string;
  experienceLevelName: string | null;
  /**
   * A withdrawn choreography is not taking part, so it is out of the list until
   * the academy picks `Retirada`, and it reads with that badge in place of its
   * operational status.
   */
  isWithdrawn: boolean;
  musicStorageKey?: string | null;
  operationalStatus: ChoreographyOperationalStatus;
};

export function formatGroupTypeLabel(groupType: ChoreographyGroupType) {
  return (
    choreographyGroupTypeOptions.find((option) => option.value === groupType)
      ?.label ?? groupType
  );
}
