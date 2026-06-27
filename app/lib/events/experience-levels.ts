enum ExperienceLevel {
  Amateur = "Amateur",
  Profesional = "Profesional",
  Elite = "Elite",
  PreElite = "Pre Elite",
  ProAm = "Pro-Am",
  Nudo = "Nudo",
}

export const experienceLevelOptions = Object.values(ExperienceLevel).map(
  (level) => ({
    value: level,
    label: level,
  }),
);

export function isExperienceLevel(value: string): value is ExperienceLevel {
  return Object.values(ExperienceLevel).includes(value as ExperienceLevel);
}
