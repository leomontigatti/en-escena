// PROTOTYPE (#223, #1152) — throwaway, never merge. Made-up evaluations for
// the admin and portal screens of the results prototype. The local database
// has choreographies but no presentations, judges or scores, so the numbers
// are the real automatic ordering run in memory and every evaluation below is
// derived from the order number: stable across reloads, never stored.

import { experienceLevelLabels } from "@/lib/events/experience-levels";
import {
  formatGroupTypeLabel,
  type ChoreographyGroupType,
} from "@/lib/portal/choreographies";
import {
  computeAutomaticOrder,
  type PresentationOrderingRow,
} from "@/lib/presentations/ordering";

/** The first 150 presentations of the event count as already judged. */
const evaluatedUpTo = 150;

export type PrototypeEvaluationStatus = "evaluada" | "descalificada" | null;

/**
 * Numbers the rows with the real automatic ordering when the event has no
 * presentation yet, without writing anything.
 */
export function numberRowsInMemory<
  TRow extends PresentationOrderingRow & { orderNumber: number | null },
>(rows: TRow[]): TRow[] {
  if (rows.some((row) => row.orderNumber !== null)) {
    return rows;
  }
  const order = computeAutomaticOrder(rows);
  if (!order.ok) {
    return rows;
  }
  const numbers = new Map(
    order.choreographyIds.map((id, index) => [id, index + 1]),
  );
  return rows.map((row) => ({
    ...row,
    orderNumber: numbers.get(row.choreographyId) ?? null,
  }));
}

/** Category · group type · level · modality · submodality, skipping blanks. */
export function formatPrototypeDetails(row: {
  category: { name: string };
  experienceLevel: string | null;
  groupType: ChoreographyGroupType;
  modalityName: string;
  submodalityName: string | null;
}) {
  return [
    row.category.name,
    formatGroupTypeLabel(row.groupType),
    row.experienceLevel
      ? (experienceLevelLabels[row.experienceLevel] ?? row.experienceLevel)
      : null,
    row.modalityName,
    row.submodalityName,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function getPrototypeEvaluationStatus(
  orderNumber: number | null,
): PrototypeEvaluationStatus {
  if (orderNumber === null || orderNumber > evaluatedUpTo) {
    return null;
  }
  return orderNumber % 23 === 0 ? "descalificada" : "evaluada";
}

// --- Scores -----------------------------------------------------------------

export type PrototypeCriterion = {
  id: string;
  name: string;
  maximum: number;
  deducts: boolean;
};

export const prototypeAcrobaticsCriteria: PrototypeCriterion[] = [
  { id: "tecnica", name: "Técnica", maximum: 20, deducts: false },
  {
    id: "dificultad",
    name: "Dificultad acrobática",
    maximum: 20,
    deducts: false,
  },
  { id: "ejecucion", name: "Ejecución", maximum: 15, deducts: false },
  { id: "coreografia", name: "Coreografía", maximum: 15, deducts: false },
  { id: "musicalidad", name: "Musicalidad", maximum: 10, deducts: false },
  { id: "interpretacion", name: "Interpretación", maximum: 10, deducts: false },
  { id: "puesta", name: "Vestuario y puesta", maximum: 10, deducts: false },
  { id: "caidas", name: "Caídas", maximum: 10, deducts: true },
  {
    id: "prohibidos",
    name: "Elementos prohibidos",
    maximum: 10,
    deducts: true,
  },
  { id: "tiempo", name: "Tiempo excedido", maximum: 5, deducts: true },
];

export type PrototypeScore = {
  judgeId: string;
  judgeName: string;
  /** Null when the judge has not scored it. */
  value: number | null;
  /** Per criterion, only on a sheet. */
  criterionValues: Record<string, number> | null;
  annulled: boolean;
  audioUrl: string | null;
};

const prototypeJudges = [
  { id: "j1", name: "Mariana Ríos" },
  { id: "j2", name: "Julián Ferreyra" },
  { id: "j3", name: "Carla Benítez" },
];

/** A spread of 0.5-step values around a base, per judge. */
function halfStep(value: number) {
  return Math.round(value * 2) / 2;
}

function buildSheetValues(seed: number, judgeIndex: number) {
  const values: Record<string, number> = {};
  for (const [index, criterion] of prototypeAcrobaticsCriteria.entries()) {
    if (criterion.deducts) {
      values[criterion.id] = (seed + judgeIndex + index) % 4 === 0 ? 1.5 : 0;
    } else {
      const share = 0.72 + ((seed + judgeIndex * 3 + index) % 5) * 0.05;
      values[criterion.id] = halfStep(criterion.maximum * share);
    }
  }
  return values;
}

export function computePrototypeSheetTotal(values: Record<string, number>) {
  let total = 0;
  for (const criterion of prototypeAcrobaticsCriteria) {
    const value = values[criterion.id] ?? 0;
    total += criterion.deducts ? -value : value;
  }
  return Math.min(100, Math.max(0, total));
}

/**
 * The panel of one presentation. The third judge has not scored every fifth
 * evaluated one, the second judge's score is annulled on every seventh, and
 * roughly two in three scores carry a `Devolución`.
 */
export function buildPrototypeScores(input: {
  orderNumber: number;
  isSheet: boolean;
}): PrototypeScore[] {
  const { orderNumber, isSheet } = input;

  return prototypeJudges.map((judge, judgeIndex) => {
    const isMissing = judgeIndex === 2 && orderNumber % 5 === 0;
    const criterionValues =
      isSheet && !isMissing ? buildSheetValues(orderNumber, judgeIndex) : null;
    const value = isMissing
      ? null
      : criterionValues
        ? computePrototypeSheetTotal(criterionValues)
        : halfStep(58 + ((orderNumber * 7 + judgeIndex * 11) % 40));

    return {
      judgeId: judge.id,
      judgeName: judge.name,
      value,
      criterionValues,
      annulled: judgeIndex === 1 && orderNumber % 7 === 0,
      audioUrl:
        value !== null && (orderNumber + judgeIndex) % 3 !== 0
          ? prototypeFeedbackUrl
          : null,
    };
  });
}

// --- Average and medal ------------------------------------------------------

export function computePrototypeAverage(scores: PrototypeScore[]) {
  const counted = scores.filter(
    (score) => !score.annulled && score.value !== null,
  );
  if (counted.length === 0) {
    return null;
  }
  const sum = counted.reduce((total, score) => total + (score.value ?? 0), 0);
  return Math.round((sum / counted.length) * 100) / 100;
}

export type PrototypeMedal = {
  label: string;
  variant: "default" | "secondary" | "outline" | "warning" | "info";
};

export function getPrototypeMedal(average: number): PrototypeMedal {
  if (average >= 90) {
    return { label: "Medalla de oro", variant: "warning" };
  }
  if (average >= 80) {
    return { label: "Medalla de plata", variant: "secondary" };
  }
  if (average >= 60) {
    return { label: "Medalla de bronce", variant: "outline" };
  }
  return { label: "Mención especial", variant: "info" };
}

export function formatPrototypeScore(value: number) {
  return String(value);
}

/** Two seconds of silence standing in for a recorded `Devolución`. */
const prototypeFeedbackUrl = (() => {
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

// --- Published results (portal) ---------------------------------------------

/** The snapshot the academies see: the evaluations up to this number. */
const publishedUpTo = 140;

export type PrototypePublishedResult =
  | { kind: "medalla"; average: number; medal: PrototypeMedal }
  | { kind: "descalificada" }
  | null;

export function getPrototypePublishedResult(input: {
  orderNumber: number | null;
  isSheet: boolean;
}): PrototypePublishedResult {
  const { orderNumber, isSheet } = input;
  if (orderNumber === null || orderNumber > publishedUpTo) {
    return null;
  }
  const status = getPrototypeEvaluationStatus(orderNumber);
  if (status === "descalificada") {
    return { kind: "descalificada" };
  }
  const average = computePrototypeAverage(
    buildPrototypeScores({ orderNumber, isSheet }),
  );
  return average === null
    ? null
    : { kind: "medalla", average, medal: getPrototypeMedal(average) };
}

export function isPrototypeSheetModality(modalityName: string) {
  return modalityName.startsWith("Acrobacias");
}
