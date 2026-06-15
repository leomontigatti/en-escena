export const groupTypeLabels: Record<string, string> = {
  solo: "Solo",
  duo: "Dúo",
  trio: "Trío",
  grupal: "Grupal",
};

export const groupTypeOptions = Object.entries(groupTypeLabels).map(
  ([value, label]) => ({
    value,
    label,
  }),
);

export function formatGroupTypes(groupTypes: string[]) {
  return groupTypes
    .map((groupType) => groupTypeLabels[groupType] ?? groupType)
    .join(", ");
}
