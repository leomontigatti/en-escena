// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// In-memory data for the admin seminar-money prototype of wayfinder ticket #890
// (map #884): one event's seminar price list, one `Exclusivo` seminar, eighteen
// inscriptions across three academies, and one academy's finance account. Every
// figure is derived here with the rules the map already decided — event-level
// seminar prices, the kind fallback and the deposit (#904), the participant
// reading (#887), covered and places left (#888), the withdrawn row (#889) —
// never read from a database.
import { formatInscriptionStatusBadge } from "@/lib/finances/choreography-financial-status";
import {
  deriveChoreographyFinancialStatus,
  deriveInscriptionFinancialStatus,
  resolveInscriptionStatusBadge,
  type InscriptionFinancialStatus,
} from "@/lib/finances/inscription-financial-status";
import type { OperationalFinanceAmount } from "@/lib/finances/operational-summary";

import {
  depositFor,
  eventSeminarPrices,
  listMissingBaseCells,
  resolveCurrentSeminarPrice,
  type SeminarKind,
  type SeminarPriceRow,
  type SeminarPriceUsage,
} from "./seminar-prices.prototype";

export * from "./seminar-prices.prototype";

export const prototypeCaseIds = ["normal", "lleno", "falta-precio"] as const;
export type PrototypeCaseId = (typeof prototypeCaseIds)[number];

type InscriptionSeed = {
  id: string;
  fullName: string;
  personKind: "dancer" | "professor";
  academyId: string;
  academyName: string;
  participating: boolean;
  allocatedAmount: number;
  storedPriceId: string | null;
  withdrawn: boolean;
};

export type SeminarInscriptionFigures = InscriptionSeed & {
  covered: boolean;
  depositAmount: number | null;
  financialStatus: InscriptionFinancialStatus;
  owedBalanceAmount: number | null;
  owedDepositAmount: number | null;
  price: SeminarPriceRow | null;
  totalAmount: number | null;
};

export type PrototypeSeminar = {
  id: string;
  instructorName: string;
  kind: SeminarKind;
  scheduledDate: string;
  startTime: string;
  quota: number;
  requiredDepositPercentage: number;
  coveredCount: number;
  registeredCount: number;
};

export type ChoreographyUnitRow = {
  id: string;
  choreographyNumber: number;
  name: string;
  groupType: string;
  depositAmount: OperationalFinanceAmount;
  totalAmount: OperationalFinanceAmount;
  owedBalanceAmount: OperationalFinanceAmount;
  owedDepositAmount: OperationalFinanceAmount;
  financialStatus: InscriptionFinancialStatus;
};

export type SeminarUnitRow = {
  id: string;
  instructorName: string;
  scheduledDate: string;
  inscriptionCount: number;
  depositAmount: OperationalFinanceAmount;
  totalAmount: OperationalFinanceAmount;
  owedBalanceAmount: OperationalFinanceAmount;
  owedDepositAmount: OperationalFinanceAmount;
  financialStatus: InscriptionFinancialStatus;
};

type FinanceAccountFixture = {
  academyId: string;
  academyName: string;
  availableBalanceAmount: number;
  depositAmount: OperationalFinanceAmount;
  totalAmount: OperationalFinanceAmount;
  owedBalanceAmount: OperationalFinanceAmount;
};

const prototypeAcademy = {
  id: "academia-sur",
  name: "Estudio Danza Sur",
};

/** Shaped like `PriceListItem`, cast where the real choreography table reads it. */
const choreographyPrices = [
  ["solo-septiembre", "Solo septiembre", "solo", "2026-09-20", 50000],
  ["solo", "Solo", "solo", null, 60000],
  ["duo-septiembre", "Dúo septiembre", "duo", "2026-09-20", 100000],
  ["grupal", "Grupal", "grupal", null, 300000],
].map(([id, name, groupType, paymentDeadline, amount]) => ({
  id,
  eventId: "evento-prototipo",
  name,
  groupType,
  paymentDeadline,
  amount,
  scheduleId: null,
  schedule: null,
  createdAt: new Date("2026-08-01T12:00:00Z"),
}));

const otherAcademies = [
  {
    id: "academia-norte",
    name: "Ballet Norte",
    names: [
      "Abril Castro",
      "Bruno Díaz",
      "Camila Sosa",
      "Delfina Romero",
      "Emilia Torres",
      "Florencia Ibarra",
      "Guadalupe Luna",
    ],
  },
  {
    id: "academia-movimiento",
    name: "Espacio Movimiento",
    names: [
      "Helena Vera",
      "Iván Molina",
      "Julia Paz",
      "Kiara Ortiz",
      "Lola Herrera",
    ],
  },
];

/** The `Estado` badge of one seminar inscription, through the real translators. */
export function formatSeminarInscriptionBadge(
  inscription: Pick<SeminarInscriptionFigures, "financialStatus" | "withdrawn">,
) {
  return formatInscriptionStatusBadge(
    resolveInscriptionStatusBadge({
      anomalies: [],
      financialStatus: inscription.financialStatus,
      withdrawn: inscription.withdrawn,
    }),
  );
}

/**
 * Effective row = `crossed ? stored : (current ?? stored)`, with `crossed`
 * tested against the stored row, which also freezes the participant fact
 * (#904). A withdrawn row's total is what it holds (#889).
 */
function deriveFigures(
  seed: InscriptionSeed,
  rows: SeminarPriceRow[],
  kind: SeminarKind,
  rate: number,
): SeminarInscriptionFigures {
  const stored = rows.find((row) => row.id === seed.storedPriceId) ?? null;
  const storedDeposit = stored ? depositFor(stored.amount, rate) : null;
  const crossed =
    storedDeposit !== null &&
    seed.allocatedAmount > 0 &&
    seed.allocatedAmount >= storedDeposit;
  const price = crossed
    ? stored
    : (resolveCurrentSeminarPrice(rows, kind, seed.participating) ?? stored);

  if (seed.withdrawn) {
    return {
      ...seed,
      covered: false,
      depositAmount: seed.allocatedAmount,
      financialStatus: "paidInFull",
      owedBalanceAmount: 0,
      owedDepositAmount: 0,
      price,
      totalAmount: seed.allocatedAmount,
    };
  }

  const totalAmount = price?.amount ?? null;
  const depositAmount =
    totalAmount === null ? null : depositFor(totalAmount, rate);

  return {
    ...seed,
    covered: crossed,
    depositAmount,
    financialStatus: deriveInscriptionFinancialStatus({
      allocatedAmount: seed.allocatedAmount,
      depositAmount,
      totalAmount,
    }),
    owedBalanceAmount:
      totalAmount === null
        ? null
        : Math.max(totalAmount - seed.allocatedAmount, 0),
    owedDepositAmount:
      depositAmount === null
        ? null
        : Math.max(depositAmount - seed.allocatedAmount, 0),
    price,
    totalAmount,
  };
}

function buildSeeds(): InscriptionSeed[] {
  const sur = prototypeAcademy;
  const seed = (
    fields: Omit<InscriptionSeed, "academyId" | "academyName">,
  ): InscriptionSeed => ({
    ...fields,
    academyId: sur.id,
    academyName: sur.name,
  });
  const surSeeds: InscriptionSeed[] = [
    // Nothing on it yet: reads today's `Exclusivo` participant row.
    seed({
      id: "insc-lucia",
      fullName: "Lucía Fernández",
      personKind: "dancer",
      participating: true,
      allocatedAmount: 0,
      storedPriceId: null,
      withdrawn: false,
    }),
    // Not participating: no `Exclusivo` row for the cell, so the `Común` one.
    seed({
      id: "insc-tomas",
      fullName: "Tomás Acosta",
      personKind: "dancer",
      participating: false,
      allocatedAmount: 10000,
      storedPriceId: "comun-no-participantes-septiembre",
      withdrawn: false,
    }),
    // Partial money below the deposit: intent, not a place.
    seed({
      id: "insc-valentina",
      fullName: "Valentina Pereyra",
      personKind: "dancer",
      participating: true,
      allocatedAmount: 15000,
      storedPriceId: "exclusivo-participantes-septiembre",
      withdrawn: false,
    }),
    seed({
      id: "insc-sofia",
      fullName: "Sofía Medina",
      personKind: "dancer",
      participating: true,
      allocatedAmount: 25000,
      storedPriceId: "exclusivo-participantes-septiembre",
      withdrawn: false,
    }),
    seed({
      id: "insc-carla",
      fullName: "Carla Benítez",
      personKind: "professor",
      participating: true,
      allocatedAmount: 45000,
      storedPriceId: "exclusivo-participantes-septiembre",
      withdrawn: false,
    }),
    // Covered as a participant, no longer participating: the stored row keeps
    // the participant price and says nothing about the flip.
    seed({
      id: "insc-martina",
      fullName: "Martina Quiroga",
      personKind: "dancer",
      participating: false,
      allocatedAmount: 22500,
      storedPriceId: "exclusivo-participantes-septiembre",
      withdrawn: false,
    }),
    // Removed with money on it: withdrawn, keeps the money, frees the place.
    seed({
      id: "insc-joaquin",
      fullName: "Joaquín Ríos",
      personKind: "dancer",
      participating: false,
      allocatedAmount: 20000,
      storedPriceId: "comun-no-participantes-septiembre",
      withdrawn: true,
    }),
  ];

  const otherSeeds = otherAcademies.flatMap((academy) =>
    academy.names.map((fullName, index): InscriptionSeed => {
      const stage = index % 3;

      return {
        id: `insc-${academy.id}-${index}`,
        fullName,
        personKind: "dancer",
        academyId: academy.id,
        academyName: academy.name,
        participating: true,
        allocatedAmount: stage === 0 ? 15000 : stage === 1 ? 30000 : 0,
        storedPriceId:
          stage === 2 ? null : "exclusivo-participantes-septiembre",
        withdrawn: false,
      };
    }),
  );

  return [...surSeeds, ...otherSeeds];
}

function complete(amount: number): OperationalFinanceAmount {
  return { amount, status: "complete" };
}

function sumAmounts(values: Array<number | null>): OperationalFinanceAmount {
  const missingPriceCount = values.filter((value) => value === null).length;
  const amount = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);

  return missingPriceCount > 0
    ? { amount, missingPriceCount, status: "incomplete" }
    : complete(amount);
}

function addAmounts(
  values: OperationalFinanceAmount[],
): OperationalFinanceAmount {
  const amount = values.reduce((sum, value) => sum + value.amount, 0);
  const missingPriceCount = values.reduce(
    (sum, value) =>
      sum + (value.status === "incomplete" ? value.missingPriceCount : 0),
    0,
  );

  return missingPriceCount > 0
    ? { amount, missingPriceCount, status: "incomplete" }
    : complete(amount);
}

export function buildPrototypeData(caseId: PrototypeCaseId) {
  // "Falta precio": the event lacks the deadline-less `Común` row for
  // non-participants, so no seminar has opened and nobody is registered.
  const isClosed = caseId === "falta-precio";
  const rate = 50;
  const seminarKind: SeminarKind = "special";
  const seminarPrices = isClosed
    ? eventSeminarPrices.filter(
        (row) => row.id !== "comun-no-participantes-sin-fecha",
      )
    : eventSeminarPrices;
  const inscriptions = (isClosed ? [] : buildSeeds()).map((seed) =>
    deriveFigures(seed, seminarPrices, seminarKind, rate),
  );
  const coveredCount = inscriptions.filter(
    (inscription) => inscription.covered,
  ).length;
  const registeredCount = inscriptions.filter(
    (inscription) => !inscription.withdrawn,
  ).length;

  const seminar: PrototypeSeminar = {
    id: "seminario-julieta",
    instructorName: "Julieta Ruiz",
    kind: seminarKind,
    scheduledDate: "2026-10-12",
    startTime: "15:00",
    // "Lleno": the covered rows already fill the quota.
    quota: caseId === "lleno" ? coveredCount : 20,
    requiredDepositPercentage: rate,
    coveredCount,
    registeredCount,
  };

  const seminars: PrototypeSeminar[] = [
    seminar,
    {
      id: "seminario-martin",
      instructorName: "Martín Gómez",
      kind: "regular",
      scheduledDate: "2026-10-13",
      startTime: "11:00",
      quota: 15,
      requiredDepositPercentage: 50,
      coveredCount: isClosed ? 0 : 6,
      registeredCount: isClosed ? 0 : 9,
    },
    {
      id: "seminario-ana",
      instructorName: "Ana Ferreyra",
      kind: "regular",
      scheduledDate: "2026-10-14",
      startTime: "17:30",
      quota: 25,
      requiredDepositPercentage: 40,
      coveredCount: 0,
      registeredCount: isClosed ? 0 : 3,
    },
  ];

  const hasActiveInscriptions = seminars.some(
    (item) => item.registeredCount > 0,
  );
  const priceUsage: Record<string, SeminarPriceUsage> = Object.fromEntries(
    seminarPrices.map((row) => [
      row.id,
      {
        referencedCount: inscriptions.filter(
          (inscription) => inscription.storedPriceId === row.id,
        ).length,
        isProtected:
          hasActiveInscriptions &&
          row.kind === "regular" &&
          row.paymentDeadline === null,
      },
    ]),
  );

  const academyInscriptions = inscriptions.filter(
    (inscription) => inscription.academyId === prototypeAcademy.id,
  );

  const seminarUnitRows: SeminarUnitRow[] = isClosed
    ? []
    : [
        {
          id: seminar.id,
          instructorName: seminar.instructorName,
          scheduledDate: seminar.scheduledDate,
          inscriptionCount: academyInscriptions.filter((row) => !row.withdrawn)
            .length,
          depositAmount: sumAmounts(
            academyInscriptions.map((row) => row.depositAmount),
          ),
          totalAmount: sumAmounts(
            academyInscriptions.map((row) => row.totalAmount),
          ),
          owedBalanceAmount: sumAmounts(
            academyInscriptions.map((row) => row.owedBalanceAmount),
          ),
          owedDepositAmount: sumAmounts(
            academyInscriptions.map((row) => row.owedDepositAmount),
          ),
          // The unit's state is the minimum of its active rows, as a choreography's is.
          financialStatus: deriveChoreographyFinancialStatus(
            academyInscriptions
              .filter((row) => !row.withdrawn)
              .map((row) => row.financialStatus),
          ),
        },
        {
          id: "seminario-martin",
          instructorName: "Martín Gómez",
          scheduledDate: "2026-10-13",
          inscriptionCount: 2,
          depositAmount: complete(40000),
          totalAmount: complete(80000),
          owedBalanceAmount: complete(60000),
          owedDepositAmount: complete(20000),
          financialStatus: "depositPending",
        },
      ];

  const choreographyUnitRows: ChoreographyUnitRow[] = [
    {
      id: "coreografia-12",
      choreographyNumber: 12,
      name: "Raíces",
      groupType: "grupal",
      depositAmount: complete(90000),
      totalAmount: complete(300000),
      owedBalanceAmount: complete(210000),
      owedDepositAmount: complete(0),
      financialStatus: "depositMet",
    },
    {
      id: "coreografia-27",
      choreographyNumber: 27,
      name: "Luz de agosto",
      groupType: "solo",
      depositAmount: complete(15000),
      totalAmount: complete(50000),
      owedBalanceAmount: complete(50000),
      owedDepositAmount: complete(15000),
      financialStatus: "depositPending",
    },
    {
      id: "coreografia-31",
      choreographyNumber: 31,
      name: "Contratiempo",
      groupType: "duo",
      depositAmount: complete(30000),
      totalAmount: complete(100000),
      owedBalanceAmount: complete(0),
      owedDepositAmount: complete(0),
      financialStatus: "paidInFull",
    },
  ];

  const units = [...choreographyUnitRows, ...seminarUnitRows];
  const availableBalanceAmount = 45000;
  // Academy-scope figures sum both kinds (#886).
  const academySummary = {
    availableBalanceAmount,
    depositAmount: addAmounts(units.map((unit) => unit.depositAmount)),
    totalAmount: addAmounts(units.map((unit) => unit.totalAmount)),
    owedBalanceAmount: addAmounts(units.map((unit) => unit.owedBalanceAmount)),
    owedDepositAmount: addAmounts(units.map((unit) => unit.owedDepositAmount)),
  };

  const financeAccounts: FinanceAccountFixture[] = [
    {
      academyId: prototypeAcademy.id,
      academyName: prototypeAcademy.name,
      availableBalanceAmount,
      depositAmount: academySummary.depositAmount,
      totalAmount: academySummary.totalAmount,
      owedBalanceAmount: academySummary.owedBalanceAmount,
    },
    {
      academyId: "academia-norte",
      academyName: "Ballet Norte",
      availableBalanceAmount: 0,
      depositAmount: complete(160500),
      totalAmount: complete(520000),
      owedBalanceAmount: complete(310000),
    },
    {
      academyId: "academia-movimiento",
      academyName: "Espacio Movimiento",
      availableBalanceAmount: 12000,
      depositAmount: complete(84000),
      totalAmount: complete(275000),
      owedBalanceAmount: complete(140000),
    },
  ];

  return {
    academy: prototypeAcademy,
    academyInscriptions,
    academySummary,
    choreographyPrices,
    choreographyUnitRows,
    financeAccounts,
    inscriptions,
    missingBaseCells: listMissingBaseCells(seminarPrices),
    priceUsage,
    seminar,
    seminarPrices,
    seminarUnitRows,
    seminars,
  };
}
