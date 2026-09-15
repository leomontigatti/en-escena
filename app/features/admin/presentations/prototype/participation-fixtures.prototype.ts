// PROTOTYPE — throwaway, lives only on branch `prototype/912-participation-list`
// (wayfinder ticket #912, map #907). In-memory fixtures and a rough stand-in for
// the ordering module of #914: enough to push the participation list through its
// states, not the algorithm that ships.
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";

export type PrototypeSchedule = {
  id: string;
  name: string;
  scheduledDate: string;
  startTime: string;
};

export type PrototypeCategory = {
  id: string;
  name: string;
  minAge: number;
  maxAge: number;
};

export type PrototypeJudge = {
  id: string;
  name: string;
  status: "active" | "suspended" | "noJudgeRole";
};

export type ParticipationRow = {
  id: string;
  choreographyNumber: number;
  name: string;
  academyName: string;
  modalityName: string;
  submodalityName: string | null;
  category: PrototypeCategory | null;
  groupType: ChoreographyGroupType;
  schedule: PrototypeSchedule | null;
  dancers: Array<{ id: string; name: string }>;
  isBelowDeposit: boolean;
  presentationId: string | null;
  orderNumber: number | null;
  judgeIds: string[];
};

export type PresentationWarningKind =
  | "dancerSpacing"
  | "outOfBlock"
  | "belowDeposit"
  | "missingCategory"
  | "missingSchedule";

export type PresentationWarning = {
  kind: PresentationWarningKind;
  label: string;
};

export const prototypeCaseIds = [
  "ordenado",
  "mixto",
  "sin-ordenar",
  "faltan-datos",
  "sin-elegibles",
  "sin-evento",
] as const;

export type PrototypeCaseId = (typeof prototypeCaseIds)[number];

export const prototypeCaseLabels: Record<PrototypeCaseId, string> = {
  ordenado: "Ordenado",
  mixto: "Mixto",
  "sin-ordenar": "Sin ordenar",
  "faltan-datos": "Faltan datos",
  "sin-elegibles": "Sin elegibles",
  "sin-evento": "Sin evento",
};

export const dancerSpacingGap = 4;

export const schedules: PrototypeSchedule[] = [
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

const categories: Record<string, PrototypeCategory> = {
  mini: { id: "mini", name: "Mini", minAge: 6, maxAge: 8 },
  infantil: { id: "infantil", name: "Infantil", minAge: 9, maxAge: 11 },
  juvenil: { id: "juvenil", name: "Juvenil", minAge: 12, maxAge: 14 },
  adulto: { id: "adulto", name: "Adulto", minAge: 18, maxAge: 99 },
};

export const judges: PrototypeJudge[] = [
  { id: "j1", name: "Laura Méndez", status: "active" },
  { id: "j2", name: "Marcos Ferreyra", status: "active" },
  { id: "j3", name: "Sofía Quiroga", status: "active" },
  { id: "j4", name: "Pablo Ortiz", status: "suspended" },
  { id: "j5", name: "Carla Benítez", status: "noJudgeRole" },
];

const academies = [
  "Estudio Danzarte",
  "Academia Pulso",
  "Ballet del Sur",
  "Movimiento Libre",
  "Casa de la Danza",
];

const modalities: Array<[string, string | null]> = [
  ["Jazz", "Lírico"],
  ["Contemporáneo", null],
  ["Clásico", "Neoclásico"],
  ["Urbano", "Hip hop"],
  ["Folklore", "Estilizado"],
];

const dancerNames = [
  "Abril Sosa",
  "Bruno Díaz",
  "Camila Rey",
  "Delfina Paz",
  "Emma Luna",
  "Franco Gil",
  "Guadalupe Ríos",
  "Helena Vera",
  "Isabella Cruz",
  "Joaquín Mora",
  "Lola Ferrari",
  "Martina Ibáñez",
  "Nina Castro",
  "Olivia Juárez",
  "Pilar Medina",
  "Renata Sáez",
  "Sol Aguirre",
  "Valentina Roldán",
];

// [number, name, academy, modality, category, group type, schedule, dancers]
type Seed = [
  number,
  string,
  number,
  number,
  keyof typeof categories,
  ChoreographyGroupType,
  string,
  number[],
];

const seeds: Seed[] = [
  [1, "Brillo", 0, 0, "mini", "solo", "s1", [0]],
  [2, "Mariposas", 1, 2, "mini", "grupal", "s1", [1, 2, 3, 4]],
  [3, "Pequeña luz", 2, 2, "mini", "solo", "s1", [5]],
  [4, "Ronda", 0, 4, "mini", "duo", "s1", [0, 6]],
  [5, "Juguetes", 3, 0, "mini", "trio", "s1", [7, 8, 9]],
  [6, "Viento sur", 4, 1, "infantil", "solo", "s1", [10]],
  [7, "Latidos", 1, 0, "infantil", "duo", "s1", [2, 11]],
  [8, "Espejos", 1, 1, "infantil", "grupal", "s1", [2, 3, 11, 12]],
  [9, "Colibrí", 2, 2, "infantil", "solo", "s1", [13]],
  [10, "Sin límites", 3, 3, "infantil", "trio", "s1", [7, 8, 14]],
  [11, "Raíces", 4, 4, "juvenil", "grupal", "s2", [10, 15, 16, 17]],
  [12, "Tormenta", 0, 3, "juvenil", "solo", "s2", [6]],
  [13, "Aurora", 2, 2, "juvenil", "duo", "s2", [13, 5]],
  [14, "Eco", 3, 1, "juvenil", "solo", "s2", [9]],
  [15, "Fuego", 0, 3, "juvenil", "trio", "s2", [0, 6, 4]],
  [16, "Marea", 1, 1, "juvenil", "grupal", "s2", [1, 11, 12, 3]],
  [17, "Horizonte", 4, 0, "adulto", "solo", "s2", [16]],
  [18, "Contraluz", 2, 1, "adulto", "duo", "s2", [15, 17]],
  [19, "Tango roto", 4, 4, "adulto", "duo", "s2", [16, 10]],
  [20, "Pulso urbano", 3, 3, "adulto", "grupal", "s2", [14, 7, 8, 9]],
  [21, "Nocturno", 2, 2, "infantil", "solo", "s3", [5]],
  [22, "Semillas", 0, 4, "infantil", "grupal", "s3", [0, 4, 6, 2]],
  [23, "Cometa", 1, 0, "infantil", "trio", "s3", [2, 3, 12]],
  [24, "Travesía", 3, 1, "juvenil", "solo", "s3", [14]],
  [25, "Alas", 2, 2, "juvenil", "grupal", "s3", [13, 5, 15, 17]],
  [26, "Río", 4, 4, "juvenil", "duo", "s3", [10, 16]],
  [27, "Resiliencia", 0, 1, "adulto", "solo", "s3", [4]],
  [28, "Distancia", 1, 0, "adulto", "duo", "s3", [11, 1]],
];

function buildRow(seed: Seed): ParticipationRow {
  const [
    number,
    name,
    academy,
    modality,
    category,
    groupType,
    schedule,
    dancers,
  ] = seed;

  return {
    id: `c${number}`,
    choreographyNumber: number,
    name,
    academyName: academies[academy] ?? "",
    modalityName: modalities[modality]?.[0] ?? "",
    submodalityName: modalities[modality]?.[1] ?? null,
    category: categories[category] ?? null,
    groupType,
    schedule: schedules.find((row) => row.id === schedule) ?? null,
    dancers: dancers.map((index) => ({
      id: `d${index}`,
      name: dancerNames[index] ?? "",
    })),
    isBelowDeposit: false,
    presentationId: null,
    orderNumber: null,
    judgeIds: [],
  };
}

export function buildCaseRows(caseId: PrototypeCaseId): ParticipationRow[] {
  const base = seeds.map(buildRow);

  if (caseId === "sin-elegibles" || caseId === "sin-evento") {
    return [];
  }

  if (caseId === "sin-ordenar") {
    return base;
  }

  if (caseId === "faltan-datos") {
    return base.map((row) => {
      if (row.choreographyNumber === 9) {
        return { ...row, category: null };
      }

      if (row.choreographyNumber === 24) {
        return { ...row, schedule: null };
      }

      return row;
    });
  }

  const ordered = runAutomaticOrdering(base).rows;
  // A manual drag the admin made after the ordering: "Tango roto" moved to the
  // top of the afternoon, out of its block.
  const tango = ordered.find((row) => row.choreographyNumber === 19);
  const afternoonFirst = ordered
    .filter((row) => row.schedule?.id === "s2")
    .sort(byOrderNumber)[0];
  let rows =
    tango?.orderNumber && afternoonFirst?.orderNumber
      ? movePresentation(ordered, tango.id, afternoonFirst.orderNumber)
      : ordered;

  rows = rows.map((row) => {
    if (row.choreographyNumber === 14) {
      // Dropped below `Señada` after the ordering: keeps its number.
      return { ...row, isBelowDeposit: true };
    }

    if (row.schedule?.id === "s1" && (row.orderNumber ?? 0) <= 6) {
      return { ...row, judgeIds: ["j1", "j2", "j3"] };
    }

    if (row.schedule?.id === "s1") {
      return { ...row, judgeIds: ["j1", "j4"] };
    }

    if (row.schedule?.id === "s2" && (row.orderNumber ?? 0) <= 14) {
      return { ...row, judgeIds: ["j2", "j5"] };
    }

    return row;
  });

  if (caseId === "ordenado") {
    return rows;
  }

  // The `mixto` case: choreographies that reached `Señada` after the ordering.
  const late: Seed[] = [
    [29, "Despertar", 3, 0, "mini", "solo", "s1", [8]],
    [30, "Laberinto", 2, 1, "juvenil", "trio", "s2", [13, 15, 17]],
    [31, "Umbral", 4, 3, "adulto", "grupal", "s3", [10, 16, 14, 7]],
  ];

  return [...rows, ...late.map(buildRow)];
}

const groupTypeRank: Record<ChoreographyGroupType, number> = {
  solo: 0,
  duo: 1,
  trio: 2,
  grupal: 3,
};

function blockKey(row: ParticipationRow) {
  return [
    row.schedule?.scheduledDate ?? "",
    row.schedule?.startTime ?? "",
    row.schedule?.name ?? "",
    String(row.category?.minAge ?? 0).padStart(3, "0"),
    String(row.category?.maxAge ?? 0).padStart(3, "0"),
    row.category?.name ?? "",
    String(groupTypeRank[row.groupType]),
  ].join("|");
}

function byOrderNumber(a: ParticipationRow, b: ParticipationRow) {
  return (a.orderNumber ?? 0) - (b.orderNumber ?? 0);
}

function sharedDancer(a: ParticipationRow, b: ParticipationRow) {
  return a.dancers.find((dancer) =>
    b.dancers.some((other) => other.id === dancer.id),
  );
}

export type OrderingRefusal = {
  reason: "missingCategory" | "missingSchedule" | "nothingToOrder";
  rows: ParticipationRow[];
};

export function checkAutomaticOrdering(
  rows: ParticipationRow[],
): OrderingRefusal | null {
  const candidates = rows.filter((row) => !row.isBelowDeposit);

  if (candidates.length === 0) {
    return { reason: "nothingToOrder", rows: [] };
  }

  const withoutCategory = candidates.filter((row) => !row.category);

  if (withoutCategory.length > 0) {
    return { reason: "missingCategory", rows: withoutCategory };
  }

  const withoutSchedule = candidates.filter((row) => !row.schedule);

  if (withoutSchedule.length > 0) {
    return { reason: "missingSchedule", rows: withoutSchedule };
  }

  return null;
}

/** Stand-in for `runAutomaticOrdering`: sort by block, place with the gap. */
export function runAutomaticOrdering(rows: ParticipationRow[]) {
  const candidates = rows
    .filter((row) => !row.isBelowDeposit)
    .sort(
      (a, b) =>
        blockKey(a).localeCompare(blockKey(b)) ||
        a.choreographyNumber - b.choreographyNumber,
    );
  const placed: ParticipationRow[] = [];
  const blocks = new Map<string, ParticipationRow[]>();

  for (const row of candidates) {
    blocks.set(blockKey(row), [...(blocks.get(blockKey(row)) ?? []), row]);
  }

  for (const block of blocks.values()) {
    const remaining = [...block];

    while (remaining.length > 0) {
      const recent = placed
        .slice(-dancerSpacingGap)
        .filter((row) => row.schedule?.id === remaining[0]?.schedule?.id);
      const index = remaining.findIndex((row) =>
        recent.every((other) => !sharedDancer(row, other)),
      );
      const [next] = remaining.splice(Math.max(index, 0), 1);

      if (next) {
        placed.push(next);
      }
    }
  }

  const orderById = new Map(placed.map((row, index) => [row.id, index + 1]));
  const removed = rows.filter(
    (row) => row.isBelowDeposit && row.presentationId !== null,
  );

  return {
    removedPresentationCount: removed.length,
    removedAssignmentCount: removed.reduce(
      (total, row) => total + row.judgeIds.length,
      0,
    ),
    rows: rows.map((row) =>
      row.isBelowDeposit
        ? { ...row, presentationId: null, orderNumber: null, judgeIds: [] }
        : {
            ...row,
            presentationId: row.presentationId ?? `p-${row.id}`,
            orderNumber: orderById.get(row.id) ?? null,
          },
    ),
  };
}

/** Stand-in for `movePresentation`: take the target's number, renumber from 1. */
export function movePresentation(
  rows: ParticipationRow[],
  rowId: string,
  toOrderNumber: number,
): ParticipationRow[] {
  const moving = rows.find((row) => row.id === rowId);

  if (!moving || !isPlaceable(moving)) {
    return rows;
  }

  // An unnumbered row is inserted (third review): it gets a presentation and
  // everything from its number on shifts down one, so 1..N stays contiguous.
  const rest = rows
    .filter((row) => row.orderNumber !== null && row.id !== rowId)
    .sort(byOrderNumber);
  const targetIndex = Math.min(Math.max(toOrderNumber - 1, 0), rest.length);
  const next = [
    ...rest.slice(0, targetIndex),
    moving,
    ...rest.slice(targetIndex),
  ];
  const orderById = new Map(next.map((row, index) => [row.id, index + 1]));

  return rows.map((row) =>
    orderById.has(row.id)
      ? {
          ...row,
          orderNumber: orderById.get(row.id) ?? null,
          presentationId: row.presentationId ?? `p-${row.id}`,
        }
      : row,
  );
}

/**
 * Whether a row can take a number by hand: any numbered row, or an unnumbered
 * one that is `Señada` and has the category and schedule its block needs.
 */
export function isPlaceable(row: ParticipationRow) {
  return (
    row.orderNumber !== null ||
    (!row.isBelowDeposit && row.category !== null && row.schedule !== null)
  );
}

/** Whether a row stops `runAutomaticOrdering`: it lacks category or schedule. */
export function blocksOrdering(row: ParticipationRow) {
  return (
    !row.isBelowDeposit && (row.category === null || row.schedule === null)
  );
}

/** The warnings that do not block the ordering. */
export function isBlockingWarning(warning: PresentationWarning) {
  return (
    warning.kind === "missingCategory" || warning.kind === "missingSchedule"
  );
}

/** Stand-in for `derivePresentationWarnings`. */
export function derivePresentationWarnings(
  rows: ParticipationRow[],
): Map<string, PresentationWarning[]> {
  const warnings = new Map<string, PresentationWarning[]>();
  const push = (rowId: string, warning: PresentationWarning) =>
    warnings.set(rowId, [...(warnings.get(rowId) ?? []), warning]);
  const ordered = rows
    .filter((row) => row.orderNumber !== null)
    .sort(byOrderNumber);

  for (const row of rows) {
    // Numbered rows too: a presentation whose choreography lost its category
    // or schedule blocks the next ordering just the same.
    if (!row.isBelowDeposit) {
      if (!row.category) {
        push(row.id, {
          kind: "missingCategory",
          label: "Sin categoría: no se puede ordenar",
        });
      }

      if (!row.schedule) {
        push(row.id, {
          kind: "missingSchedule",
          label: "Sin cronograma: no se puede ordenar",
        });
      }
    }

    if (row.isBelowDeposit && row.orderNumber !== null) {
      push(row.id, {
        kind: "belowDeposit",
        label: "Seña pendiente: no se muestra en el portal ni en el programa",
      });
    }
  }

  const counted = ordered.filter((row) => !row.isBelowDeposit);

  counted.forEach((row, index) => {
    for (const other of counted.slice(index + 1)) {
      if (
        other.schedule?.id !== row.schedule?.id ||
        (other.orderNumber ?? 0) - (row.orderNumber ?? 0) > dancerSpacingGap
      ) {
        continue;
      }

      const dancer = sharedDancer(row, other);

      if (dancer) {
        push(row.id, {
          kind: "dancerSpacing",
          label: `Separación insuficiente: comparte a ${dancer.name} con la n.º ${other.orderNumber}`,
        });
        push(other.id, {
          kind: "dancerSpacing",
          label: `Separación insuficiente: comparte a ${dancer.name} con la n.º ${row.orderNumber}`,
        });
      }
    }
  });

  // Longest non-decreasing run of block keys; everything off it is displaced.
  const keys = ordered.map(blockKey);
  const lengths = keys.map(() => 1);
  const previous = keys.map(() => -1);

  keys.forEach((key, index) => {
    for (let before = 0; before < index; before += 1) {
      if (
        (keys[before] ?? "") <= key &&
        (lengths[before] ?? 0) + 1 > (lengths[index] ?? 0)
      ) {
        lengths[index] = (lengths[before] ?? 0) + 1;
        previous[index] = before;
      }
    }
  });

  const kept = new Set<number>();
  let cursor = lengths.indexOf(Math.max(0, ...lengths));

  while (cursor >= 0) {
    kept.add(cursor);
    cursor = previous[cursor] ?? -1;
  }

  ordered.forEach((row, index) => {
    if (!kept.has(index)) {
      push(row.id, { kind: "outOfBlock", label: "Fuera de su bloque" });
    }
  });

  return warnings;
}

export function formatScheduleLabel(schedule: PrototypeSchedule | null) {
  if (!schedule) {
    return "Sin cronograma";
  }

  const [, month, day] = schedule.scheduledDate.split("-");
  const weekday = schedule.scheduledDate === "2026-10-17" ? "Sáb" : "Dom";

  return `${weekday} ${day}/${month} · ${schedule.startTime} · ${schedule.name}`;
}
