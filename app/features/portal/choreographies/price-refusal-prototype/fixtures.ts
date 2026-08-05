/**
 * THROWAWAY PROTOTYPE — fixtures for ticket #623 (map #547).
 *
 * In-memory stand-ins for what the resolution step would return once creation is
 * refused for a `(schedule, groupType)` pair with no price row. Nothing here talks
 * to the server: `resolveApplicablePrice` does not participate in registration
 * resolution today, so the refusal is simulated from a coverage table.
 */
import type { ActiveDancer, ActiveProfessor } from "../create/shared";

export type PrototypeGroupType = "solo" | "duo" | "trio" | "grupal";

export type PrototypeScheduleOption = {
  id: string;
  capacity: number;
  /** Group types the entity has loaded a price row for on this schedule. */
  pricedGroupTypes: PrototypeGroupType[];
  schedule: {
    id: string;
    name: string;
    scheduledDate: string;
    startTime: string;
  };
};

/** Replicates `deriveGroupType` (registration-resolution.server.ts:370-378). */
export function derivePrototypeGroupType(
  dancerCount: number,
): PrototypeGroupType {
  if (dancerCount === 1) return "solo";
  if (dancerCount === 2) return "duo";
  if (dancerCount === 3) return "trio";
  return "grupal";
}

export function isPriced(
  option: PrototypeScheduleOption,
  groupType: PrototypeGroupType,
) {
  return option.pricedGroupTypes.includes(groupType);
}

const escenarioA8 = {
  id: "sch-a-8",
  capacity: 24,
  pricedGroupTypes: ["solo", "duo", "grupal"],
  schedule: {
    id: "s-a-8",
    name: "Escenario A",
    scheduledDate: "2026-08-08",
    startTime: "19:30:00",
  },
} satisfies PrototypeScheduleOption;

const escenarioA9 = {
  id: "sch-a-9",
  capacity: 24,
  pricedGroupTypes: ["solo", "duo", "trio", "grupal"],
  schedule: {
    id: "s-a-9",
    name: "Escenario A",
    scheduledDate: "2026-08-09",
    startTime: "10:00:00",
  },
} satisfies PrototypeScheduleOption;

const escenarioB9 = {
  id: "sch-b-9",
  capacity: 18,
  pricedGroupTypes: ["solo", "duo", "trio", "grupal"],
  schedule: {
    id: "s-b-9",
    name: "Escenario B",
    scheduledDate: "2026-08-09",
    startTime: "16:00:00",
  },
} satisfies PrototypeScheduleOption;

const escenarioB10 = {
  id: "sch-b-10",
  capacity: 18,
  pricedGroupTypes: ["solo", "duo", "grupal"],
  schedule: {
    id: "s-b-10",
    name: "Escenario B",
    scheduledDate: "2026-08-10",
    startTime: "11:00:00",
  },
} satisfies PrototypeScheduleOption;

const escenarioC10 = {
  id: "sch-c-10",
  capacity: 30,
  pricedGroupTypes: ["solo", "duo", "grupal"],
  schedule: {
    id: "s-c-10",
    name: "Escenario C",
    scheduledDate: "2026-08-10",
    startTime: "18:00:00",
  },
} satisfies PrototypeScheduleOption;

export type PrototypeCaseKey = "unico" | "parcial" | "ninguno";

export const prototypeCases: Record<
  PrototypeCaseKey,
  { label: string; description: string; options: PrototypeScheduleOption[] }
> = {
  unico: {
    label: "Un solo cronograma, sin precio",
    description:
      "No hay paso de cronograma: el flujo se corta donde se resuelve el tipo de grupo.",
    options: [escenarioA8],
  },
  parcial: {
    label: "Varios cronogramas, uno sin precio",
    description:
      "Hay paso de cronograma. Dos opciones tienen precio para trío y una no.",
    options: [escenarioA8, escenarioA9, escenarioB9],
  },
  ninguno: {
    label: "Varios cronogramas, ninguno con precio",
    description:
      "Hay varias opciones y ninguna tiene precio para trío. Prueba de degradación.",
    options: [escenarioA8, escenarioB10, escenarioC10],
  },
};

export const prototypeCaseKeys = Object.keys(
  prototypeCases,
) as PrototypeCaseKey[];

export const prototypeDancers: ActiveDancer[] = [
  { id: "d-1", firstName: "Camila", lastName: "Ferreyra" },
  { id: "d-2", firstName: "Julieta", lastName: "Sosa" },
  { id: "d-3", firstName: "Malena", lastName: "Ríos" },
  { id: "d-4", firstName: "Renata", lastName: "Ibáñez" },
  { id: "d-5", firstName: "Delfina", lastName: "Quiroga" },
];

export const prototypeProfessors: ActiveProfessor[] = [
  { id: "p-1", firstName: "Lucía", lastName: "Bermúdez" },
  { id: "p-2", firstName: "Martín", lastName: "Ojeda" },
];

/** The roster the dialog opens with: three dancers, so a trío. */
export const prototypeInitialDancerIds = ["d-1", "d-2", "d-3"];

export const prototypeChoreographyName = "Nocturno";
export const prototypeModalityLabel = "Danza jazz";
export const prototypeCategoryLabel = "Juvenil";

/**
 * The real flow has `name`, `modality` and `submodality` before `dancers`, and
 * the ticket cares that the wall lands after the academy already invested in
 * them. The prototype starts at `dancers`, so the progress bar is offset.
 */
export const precedingStepCount = 3;
