const groupTypeValues = ["solo", "duo", "trio", "grupal"] as const;

type GroupType = (typeof groupTypeValues)[number];

const groupTypeLabels: Record<string, string> = {
  solo: "Solo",
  duo: "Dúo",
  trio: "Trío",
  grupal: "Grupal",
};

const groupTypeOptions = Object.entries(groupTypeLabels).map(
  ([value, label]) => ({
    value,
    label,
  }),
);

function isGroupType(value: string): value is GroupType {
  return groupTypeValues.includes(value as GroupType);
}

export { groupTypeLabels, groupTypeOptions, groupTypeValues, isGroupType };
export type { GroupType };
