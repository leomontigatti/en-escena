// PROTOTYPE (#223) — throwaway, never merge. In-memory fixtures for the judge
// scoring prototype: no score, criteria or audio table exists yet.

import type { ChoreographyGroupType } from "@/lib/portal/choreographies";

export type Criterion = {
  id: string;
  name: string;
  max: number;
  /** A deduction subtracts from the adding criteria and starts at 0. */
  deducts: boolean;
};

export type Assignment = {
  id: string;
  orderNumber: number;
  name: string;
  categoryName: string;
  groupType: ChoreographyGroupType;
  /** Null when the category does not ask for a level. */
  experienceLevelName: string | null;
  modalityName: string;
  submodalityName: string | null;
  /** `null` scores with a single 0–100 value; a list scores on a sheet. */
  criteria: Criterion[] | null;
};

/** What a judge has saved for one presentation. */
export type Evaluation = {
  values: Record<string, string>;
  score: number | null;
  audioUrl: string | null;
  disqualified: boolean;
};

export const prototypeJudgeName = "Mariana Ríos";
export const prototypeShowDayLabel = "Sábado 17 de octubre";

const acrobaticsCriteria: Criterion[] = [
  { id: "tecnica", name: "Técnica", max: 20, deducts: false },
  { id: "dificultad", name: "Dificultad acrobática", max: 20, deducts: false },
  { id: "ejecucion", name: "Ejecución", max: 15, deducts: false },
  { id: "coreografia", name: "Coreografía", max: 15, deducts: false },
  { id: "musicalidad", name: "Musicalidad", max: 10, deducts: false },
  { id: "interpretacion", name: "Interpretación", max: 10, deducts: false },
  { id: "puesta", name: "Vestuario y puesta", max: 10, deducts: false },
  { id: "caidas", name: "Caídas", max: 10, deducts: true },
  { id: "prohibidos", name: "Elementos prohibidos", max: 10, deducts: true },
  { id: "tiempo", name: "Tiempo excedido", max: 5, deducts: true },
];

const handWrittenAssignments: Assignment[] = [
  {
    id: "p41",
    orderNumber: 41,
    name: "Raíces",
    categoryName: "Infantil",
    groupType: "grupal",
    experienceLevelName: "Amateur",
    modalityName: "Folklore",
    submodalityName: "Estilizado",
    criteria: null,
  },
  {
    id: "p42",
    orderNumber: 42,
    name: "Luz de invierno",
    categoryName: "Infantil",
    groupType: "solo",
    experienceLevelName: "Amateur",
    modalityName: "Clásico",
    submodalityName: "Repertorio",
    criteria: null,
  },
  {
    id: "p43",
    orderNumber: 43,
    name: "Vértigo",
    categoryName: "Infantil",
    groupType: "grupal",
    experienceLevelName: "Amateur",
    modalityName: "Acrobacia",
    submodalityName: "Acro dance",
    criteria: acrobaticsCriteria,
  },
  {
    id: "p44",
    orderNumber: 44,
    name: "Tormenta",
    categoryName: "Juvenil",
    groupType: "duo",
    experienceLevelName: "Profesional",
    modalityName: "Contemporáneo",
    submodalityName: null,
    criteria: null,
  },
  {
    id: "p45",
    orderNumber: 45,
    name: "Ecos del puerto",
    categoryName: "Juvenil",
    groupType: "trio",
    experienceLevelName: "Profesional",
    modalityName: "Tango",
    submodalityName: "Escenario",
    criteria: null,
  },
  {
    id: "p46",
    orderNumber: 46,
    name: "Gravedad cero",
    categoryName: "Juvenil",
    groupType: "solo",
    experienceLevelName: "Profesional",
    modalityName: "Acrobacia",
    submodalityName: "Acro dance",
    criteria: acrobaticsCriteria,
  },
  {
    id: "p47",
    orderNumber: 47,
    name: "Asfalto",
    categoryName: "Juvenil",
    groupType: "grupal",
    experienceLevelName: "Profesional",
    modalityName: "Urbano",
    submodalityName: "Hip hop",
    criteria: null,
  },
  {
    id: "p48",
    orderNumber: 48,
    name: "Marea",
    categoryName: "Mayores",
    groupType: "solo",
    experienceLevelName: "Pre Elite",
    modalityName: "Jazz",
    submodalityName: "Lírico",
    criteria: null,
  },
  {
    id: "p49",
    orderNumber: 49,
    name: "Caída libre",
    categoryName: "Mayores",
    groupType: "duo",
    experienceLevelName: "Pre Elite",
    modalityName: "Acrobacia",
    submodalityName: "Acro dance",
    criteria: acrobaticsCriteria,
  },
  {
    id: "p50",
    orderNumber: 50,
    name: "Fuego lento",
    categoryName: "Mayores",
    groupType: "grupal",
    experienceLevelName: "Elite",
    modalityName: "Jazz",
    submodalityName: "Musical",
    criteria: null,
  },
  {
    id: "p51",
    orderNumber: 51,
    name: "La espera",
    categoryName: "Mayores",
    groupType: "solo",
    experienceLevelName: null,
    modalityName: "Contemporáneo",
    submodalityName: null,
    criteria: null,
  },
  {
    id: "p52",
    orderNumber: 52,
    name: "Nómades",
    categoryName: "Adultos",
    groupType: "grupal",
    experienceLevelName: "Pro-Am",
    modalityName: "Urbano",
    submodalityName: "Heels",
    criteria: null,
  },
];

/**
 * Two seconds of silence standing in for a feedback recorded earlier in the
 * show, so the saved state has something the player can load.
 */
const silentFeedbackUrl = (() => {
  const sampleRate = 8000;
  const sampleCount = sampleRate * 2;
  const bytes = new Uint8Array(44 + sampleCount);
  const view = new DataView(bytes.buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      bytes[offset + index] = text.charCodeAt(index);
    }
  };
  writeText(0, "RIFF");
  view.setUint32(4, 36 + sampleCount, true);
  writeText(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeText(36, "data");
  view.setUint32(40, sampleCount, true);
  bytes.fill(128, 44);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
})();

// A full show day around the hand-written rows: 1–40 already scored before
// them, 53–80 still to come, so the list is as long as a real day.
const generatedNames = [
  "Brisa",
  "Umbral",
  "Latido",
  "Orilla",
  "Espiral",
  "Cenizas",
  "Alas",
  "Silencio",
  "Puente",
  "Reflejo",
  "Raíz",
  "Horizonte",
  "Sombra",
  "Deriva",
];
const generatedCategories = ["Infantil", "Juvenil", "Mayores", "Adultos"];
const generatedGroupTypes: ChoreographyGroupType[] = [
  "solo",
  "duo",
  "trio",
  "grupal",
];
const generatedLevels = ["Amateur", "Profesional", "Elite", null];
const generatedModalities: [string, string | null][] = [
  ["Folklore", "Estilizado"],
  ["Clásico", "Repertorio"],
  ["Contemporáneo", null],
  ["Jazz", "Musical"],
  ["Urbano", "Heels"],
  ["Acrobacia", "Acro dance"],
];

function buildGeneratedAssignment(orderNumber: number): Assignment {
  const pick = <T>(options: T[]) => options[orderNumber % options.length] as T;
  const [modalityName, submodalityName] = pick(generatedModalities);

  return {
    id: `p${orderNumber}`,
    orderNumber,
    name: `${pick(generatedNames)} ${Math.ceil(orderNumber / generatedNames.length)}`,
    categoryName: pick(generatedCategories),
    groupType: pick(generatedGroupTypes),
    experienceLevelName: pick(generatedLevels),
    modalityName,
    submodalityName,
    criteria: modalityName === "Acrobacia" ? acrobaticsCriteria : null,
  };
}

function buildGeneratedRange(from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, index) =>
    buildGeneratedAssignment(from + index),
  );
}

export const prototypeAssignments: Assignment[] = [
  ...buildGeneratedRange(1, 40),
  ...handWrittenAssignments,
  ...buildGeneratedRange(53, 80),
];

/** A plausible saved score for a row scored before the hand-written ones. */
function buildEarlierEvaluation(assignment: Assignment): Evaluation {
  const audioUrl = assignment.orderNumber % 3 === 0 ? null : silentFeedbackUrl;

  if (!assignment.criteria) {
    const score = 60 + ((assignment.orderNumber * 7) % 35);
    return {
      values: { puntaje: String(score) },
      score,
      audioUrl,
      disqualified: false,
    };
  }

  const values = Object.fromEntries(
    assignment.criteria.map((criterion) => [
      criterion.id,
      criterion.deducts ? "0" : String(criterion.max - 2),
    ]),
  );
  return { values, score: 86, audioUrl, disqualified: false };
}

/** A show already under way: three rows carry each non-pending state. */
export const prototypeInitialEvaluations: Record<string, Evaluation> = {
  ...Object.fromEntries(
    prototypeAssignments
      .filter((assignment) => assignment.orderNumber <= 40)
      .map((assignment) => [assignment.id, buildEarlierEvaluation(assignment)]),
  ),
  p41: {
    values: { puntaje: "84,5" },
    score: 84.5,
    audioUrl: silentFeedbackUrl,
    disqualified: false,
  },
  p42: {
    values: { puntaje: "72" },
    score: 72,
    audioUrl: null,
    disqualified: false,
  },
  p44: {
    values: { puntaje: "" },
    score: null,
    audioUrl: null,
    disqualified: true,
  },
};
