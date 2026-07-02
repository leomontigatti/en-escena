const experienceLevelValues = [
  "amateur",
  "profesional",
  "elite",
  "pre_elite",
  "pro_am",
  "nudo",
] as const;

type ExperienceLevel = (typeof experienceLevelValues)[number];

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
  experienceLevelValues,
  isExperienceLevel,
};
export type { ExperienceLevel };
