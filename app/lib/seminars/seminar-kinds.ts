const seminarKindValues = ["regular", "special"] as const;

type SeminarKind = (typeof seminarKindValues)[number];

const defaultSeminarKind: SeminarKind = "regular";

const seminarKindLabels: Record<SeminarKind, string> = {
  regular: "Común",
  special: "Exclusivo",
};

const seminarKindOptions = seminarKindValues.map((value) => ({
  value,
  label: seminarKindLabels[value],
}));

function isSeminarKind(value: string): value is SeminarKind {
  return seminarKindValues.includes(value as SeminarKind);
}

export {
  defaultSeminarKind,
  isSeminarKind,
  seminarKindLabels,
  seminarKindOptions,
  seminarKindValues,
  type SeminarKind,
};
