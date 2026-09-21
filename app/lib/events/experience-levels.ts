const experienceLevelValues = [
  "amateur",
  "profesional",
  "elite",
  "pre_elite",
  "pro_am",
  "nudo",
] as const;

type ExperienceLevel = (typeof experienceLevelValues)[number];

/**
 * The levels from the least to the most experienced, as the presentation order
 * runs through them. It is written out instead of derived from
 * `experienceLevelValues` because that one is the pg enum's declaration order,
 * which cannot be reordered without recreating the type.
 */
const experienceLevelOrder: readonly ExperienceLevel[] = [
  "nudo",
  "amateur",
  "profesional",
  "pre_elite",
  "elite",
  "pro_am",
];

const experienceLevelLabels: Record<string, string> = {
  amateur: "Amateur",
  profesional: "Profesional",
  elite: "Elite",
  pre_elite: "Pre Elite",
  pro_am: "Pro-Am",
  nudo: "Nudo",
};

const experienceLevelOptions = Object.entries(experienceLevelLabels).map(
  ([value, label]) => ({
    value,
    label,
  }),
);

function isExperienceLevel(value: string): value is ExperienceLevel {
  return experienceLevelValues.includes(value as ExperienceLevel);
}

export {
  experienceLevelLabels,
  experienceLevelOptions,
  experienceLevelOrder,
  experienceLevelValues,
  isExperienceLevel,
};
export type { ExperienceLevel };
