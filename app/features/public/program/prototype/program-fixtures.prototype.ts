// PROTOTYPE — throwaway, lives only on branch `prototype/913-program-pages`
// (wayfinder ticket #913, map #907). In-memory fixtures standing in for
// `readEventProgram` from #914: the rows it would return after the shared
// eligibility predicate, plus the few the portal needs to explain what it hides.
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";

export type ProgramSchedule = {
  id: string;
  name: string;
  scheduledDate: string;
  startTime: string;
};

export type ProgramRow = {
  id: string;
  /** Null only for a late eligible choreography the admin has not placed yet. */
  orderNumber: number | null;
  name: string;
  academyName: string;
  modalityName: string;
  submodalityName: string | null;
  categoryName: string;
  groupType: ChoreographyGroupType;
  scheduleId: string;
  /** The choreography's own number, unrelated to the order number. */
  choreographyNumber: number;
  /** Filled for every group type; only the list decides to show solos and duos. */
  dancerNames: string[];
  /** Below `Señada` after ordering: keeps its number, hidden outside admin. */
  isBelowDeposit: boolean;
};

export const prototypeEvent = {
  name: "En Escena 2026",
  startsAt: "2026-10-17",
  endsAt: "2026-10-18",
};

export const ownAcademyName = "Estudio Danzarte";

export const programSchedules: ProgramSchedule[] = [
  {
    id: "s1",
    name: "Sábado mañana",
    scheduledDate: "2026-10-17",
    startTime: "10:00",
  },
  {
    id: "s2",
    name: "Sábado tarde",
    scheduledDate: "2026-10-17",
    startTime: "15:00",
  },
  {
    id: "s3",
    name: "Domingo mañana",
    scheduledDate: "2026-10-18",
    startTime: "10:00",
  },
];

type Seed = [
  name: string,
  academyName: string,
  modality: string,
  submodality: string | null,
  category: string,
  groupType: ChoreographyGroupType,
];

const seeds: Record<string, Seed[]> = {
  s1: [
    ["Pequeñas estrellas", "Academia Pulso", "Jazz", null, "Mini", "grupal"],
    ["Mariposa", ownAcademyName, "Clásico", "Repertorio", "Mini", "solo"],
    [
      "Juego de sombras",
      "Ballet del Sur",
      "Contemporáneo",
      null,
      "Mini",
      "duo",
    ],
    ["Ronda", "Casa de la Danza", "Folklore", "Zamba", "Infantil", "trio"],
    ["Latido", ownAcademyName, "Jazz", "Lírico", "Infantil", "solo"],
    [
      "Viento sur",
      "Movimiento Libre",
      "Contemporáneo",
      null,
      "Infantil",
      "grupal",
    ],
    [
      "Caja de música",
      "Academia Pulso",
      "Clásico",
      "Variación",
      "Infantil",
      "solo",
    ],
    ["Tormenta", ownAcademyName, "Urbano", "Hip hop", "Infantil", "grupal"],
    ["Raíces", "Casa de la Danza", "Folklore", "Chacarera", "Infantil", "duo"],
  ],
  s2: [
    ["Espejos", "Ballet del Sur", "Contemporáneo", null, "Juvenil", "solo"],
    ["Fuego lento", ownAcademyName, "Jazz", "Lírico", "Juvenil", "duo"],
    ["Ciudad", "Movimiento Libre", "Urbano", "Hip hop", "Juvenil", "grupal"],
    ["La espera", "Academia Pulso", "Clásico", "Repertorio", "Juvenil", "solo"],
    ["Horizonte", "Casa de la Danza", "Contemporáneo", null, "Juvenil", "trio"],
    ["Tango del puerto", "Estudio Danzarte", "Tango", null, "Juvenil", "duo"],
    [
      "Pulso urbano",
      "Movimiento Libre",
      "Urbano",
      "Breaking",
      "Juvenil",
      "grupal",
    ],
    ["Silencio", "Ballet del Sur", "Clásico", "Variación", "Juvenil", "solo"],
  ],
  s3: [
    ["Memoria", "Academia Pulso", "Contemporáneo", null, "Adulto", "solo"],
    ["Nocturno", ownAcademyName, "Clásico", "Repertorio", "Adulto", "solo"],
    ["Malambo", "Casa de la Danza", "Folklore", "Malambo", "Adulto", "grupal"],
    ["Distancia", "Ballet del Sur", "Contemporáneo", null, "Adulto", "duo"],
    ["Brillo", "Movimiento Libre", "Jazz", "Comercial", "Adulto", "grupal"],
    ["Umbral", ownAcademyName, "Contemporáneo", null, "Adulto", "trio"],
    ["Milonga", "Academia Pulso", "Tango", null, "Adulto", "duo"],
  ],
};

const dancerPool = [
  "Valentina Ríos",
  "Martina Gómez",
  "Sofía Acosta",
  "Camila Herrera",
  "Julieta Morales",
  "Tomás Ferreyra",
  "Catalina Suárez",
  "Mía Villalba",
  "Lucas Benítez",
  "Emilia Castro",
  "Renata Domínguez",
  "Joaquín Paredes",
];

const dancerCounts: Record<ChoreographyGroupType, number> = {
  solo: 1,
  duo: 2,
  trio: 3,
  grupal: 6,
};

function dancersFor(seed: number, groupType: ChoreographyGroupType) {
  return Array.from(
    { length: dancerCounts[groupType] },
    (_, index) => dancerPool[(seed * 5 + index) % dancerPool.length]!,
  );
}

/** Numbered 1..n across the event, in schedule order, as the ordering does. */
function buildRows(): ProgramRow[] {
  let orderNumber = 0;

  return programSchedules.flatMap((schedule) =>
    (seeds[schedule.id] ?? []).map(
      ([
        name,
        academyName,
        modalityName,
        submodalityName,
        categoryName,
        groupType,
      ]) => {
        orderNumber += 1;

        return {
          id: `p${orderNumber}`,
          orderNumber,
          name,
          academyName,
          modalityName,
          submodalityName,
          categoryName,
          groupType,
          scheduleId: schedule.id,
          // Registered in a different order than they dance, as in a real event.
          choreographyNumber: ((orderNumber * 7) % 24) + 3,
          dancerNames: dancersFor(orderNumber, groupType),
          // "Tormenta" (own) and "Ciudad" dropped below `Señada` after the
          // ordering: their numbers stay, so the public program shows a gap.
          isBelowDeposit: name === "Tormenta" || name === "Ciudad",
        };
      },
    ),
  );
}

const orderedRows = buildRows();

/** An eligible choreography registered after the ordering, still unplaced. */
const lateOwnRow: ProgramRow = {
  id: "late-1",
  orderNumber: null,
  name: "Ecos",
  academyName: ownAcademyName,
  modalityName: "Jazz",
  submodalityName: "Comercial",
  categoryName: "Juvenil",
  groupType: "grupal",
  scheduleId: "s2",
  choreographyNumber: 231,
  dancerNames: dancersFor(99, "grupal"),
  isBelowDeposit: false,
};

/** What `/programa` renders: numbered rows that pass the eligibility predicate. */
export function readPublicProgramRows() {
  return orderedRows.filter((row) => !row.isBelowDeposit);
}

/**
 * The academy's rows before the portal filters them, so the page can count what
 * it hides. `withNotices` adds the late unplaced row and keeps the below-deposit
 * one; without it, the academy has neither.
 */
export function readOwnAcademyRows({ withNotices }: { withNotices: boolean }) {
  const own = orderedRows.filter((row) => row.academyName === ownAcademyName);

  return withNotices
    ? [...own, lateOwnRow]
    : own.filter((row) => !row.isBelowDeposit);
}
