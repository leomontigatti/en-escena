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

/**
 * The label a level is read by wherever it is shown — the two program loaders
 * and the academy's evaluation detail all ask here rather than indexing the map
 * themselves. `null` for a category that declares no level, and `null` too for
 * a value the map does not know, which the `Record<string, string>` index would
 * otherwise hand back as an `undefined` typed `string`.
 */
function experienceLevelLabel(level: string | null): string | null {
  return level === null ? null : (experienceLevelLabels[level] ?? null);
}

function isExperienceLevel(value: string): value is ExperienceLevel {
  return experienceLevelValues.includes(value as ExperienceLevel);
}

export {
  experienceLevelLabel,
  experienceLevelLabels,
  experienceLevelOptions,
  experienceLevelOrder,
  experienceLevelValues,
  isExperienceLevel,
};
export type { ExperienceLevel };
