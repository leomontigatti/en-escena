// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// In-memory data for the admin seminar-money prototype of wayfinder ticket #890
// (map #884): one seminar with three tiers, seventeen inscriptions across three
// academies, and one academy's finance account. Every figure is derived here
// with the rules the map already decided — tiers and the deposit (#885), the
// participant reading (#887), covered and places left (#888), the withdrawn row
// (#889) — never read from a database.
import { formatPaymentDeadlineForTable } from "@/features/admin/prices/view-shared";
import { formatInscriptionStatusBadge } from "@/lib/finances/choreography-financial-status";
import {
  deriveChoreographyFinancialStatus,
  deriveInscriptionFinancialStatus,
  resolveInscriptionStatusBadge,
  type InscriptionFinancialStatus,
} from "@/lib/finances/inscription-financial-status";
import type { OperationalFinanceAmount } from "@/lib/finances/operational-summary";

export const prototypeCaseIds = ["normal", "lleno", "sin-precios"] as const;
export type PrototypeCaseId = (typeof prototypeCaseIds)[number];

/** The business date the prototype reads tiers against. */
const prototypeToday = "2026-09-10";

export type AmountKind = "participant" | "nonParticipant";

export type SeminarTier = {
  id: string;
  paymentDeadline: string | null;
  participantAmount: number;
  nonParticipantAmount: number;
};

export type TierUsage = {
  /** Inscriptions whose stored tier is this one, withdrawn rows included. */
  referencedCount: number;
  /** Whether a covered inscription holds it, which refuses amount edits. */
  heldByCovered: boolean;
};

type InscriptionSeed = {
  id: string;
  fullName: string;
  personKind: "dancer" | "professor";
  academyId: string;
  academyName: string;
  participating: boolean;
  allocatedAmount: number;
  storedTierId: string | null;
  storedKind: AmountKind | null;
  withdrawn: boolean;
};

export type SeminarInscriptionFigures = InscriptionSeed & {
  covered: boolean;
  depositAmount: number | null;
  financialStatus: InscriptionFinancialStatus;
  kind: AmountKind;
  owedBalanceAmount: number | null;
  owedDepositAmount: number | null;
  tier: SeminarTier | null;
  totalAmount: number | null;
};

export type PrototypeSeminar = {
  id: string;
  instructorName: string;
  scheduledDate: string;
  startTime: string;
  quota: number;
  requiredDepositPercentage: number;
  tiers: SeminarTier[];
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

const julietaTiers: SeminarTier[] = [
  {
    id: "precio-septiembre",
    paymentDeadline: "2026-09-20",
    participantAmount: 30000,
    nonParticipantAmount: 40000,
  },
  {
    id: "precio-octubre",
    paymentDeadline: "2026-10-05",
    participantAmount: 35000,
    nonParticipantAmount: 45000,
  },
  {
    id: "precio-sin-fecha",
    paymentDeadline: null,
    participantAmount: 40000,
    nonParticipantAmount: 50000,
  },
];

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

export function formatTierLabel(tier: SeminarTier) {
  return tier.paymentDeadline
    ? `Hasta ${formatPaymentDeadlineForTable(tier.paymentDeadline)}`
    : formatPaymentDeadlineForTable(null);
}

export function formatKindLabel(kind: AmountKind) {
  return kind === "participant" ? "Participante" : "No participante";
}

export function amountForKind(tier: SeminarTier, kind: AmountKind) {
  return kind === "participant"
    ? tier.participantAmount
    : tier.nonParticipantAmount;
}

export function depositFor(amount: number, rate: number) {
  return Math.round((amount * rate) / 100);
}

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

function resolveCurrentTier(tiers: SeminarTier[]) {
  const dated = tiers
    .filter(
      (tier) =>
        tier.paymentDeadline !== null && tier.paymentDeadline >= prototypeToday,
    )
    .sort((left, right) =>
      (left.paymentDeadline ?? "").localeCompare(right.paymentDeadline ?? ""),
    );

  return (
    dated[0] ?? tiers.find((tier) => tier.paymentDeadline === null) ?? null
  );
}

/**
 * Effective tier = `crossed ? stored : (current ?? stored)`, with `crossed`
 * tested against the stored tier and the stored kind (#885, #887). A withdrawn
 * row's total is what it holds (#889).
 */
function deriveFigures(
  seed: InscriptionSeed,
  tiers: SeminarTier[],
  rate: number,
): SeminarInscriptionFigures {
  const stored = tiers.find((tier) => tier.id === seed.storedTierId) ?? null;
  const storedDeposit =
    stored && seed.storedKind
      ? depositFor(amountForKind(stored, seed.storedKind), rate)
      : null;
  const crossed =
    storedDeposit !== null &&
    seed.allocatedAmount > 0 &&
    seed.allocatedAmount >= storedDeposit;
  const currentKind: AmountKind = seed.participating
    ? "participant"
    : "nonParticipant";
  const tier = crossed ? stored : (resolveCurrentTier(tiers) ?? stored);
  const kind = crossed && seed.storedKind ? seed.storedKind : currentKind;

  if (seed.withdrawn) {
    return {
      ...seed,
      covered: false,
      depositAmount: seed.allocatedAmount,
      financialStatus: "paidInFull",
      kind,
      owedBalanceAmount: 0,
      owedDepositAmount: 0,
      tier,
      totalAmount: seed.allocatedAmount,
    };
  }

  const totalAmount = tier ? amountForKind(tier, kind) : null;
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
    kind,
    owedBalanceAmount:
      totalAmount === null
        ? null
        : Math.max(totalAmount - seed.allocatedAmount, 0),
    owedDepositAmount:
      depositAmount === null
        ? null
        : Math.max(depositAmount - seed.allocatedAmount, 0),
    tier,
    totalAmount,
  };
}

function buildSeeds(withMoney: boolean): InscriptionSeed[] {
  const sur = prototypeAcademy;
  const surSeeds: InscriptionSeed[] = [
    // Nothing on it yet: reads today's tier, participant amount.
    {
      id: "insc-lucia",
      fullName: "Lucía Fernández",
      personKind: "dancer",
      academyId: sur.id,
      academyName: sur.name,
      participating: true,
      allocatedAmount: 0,
      storedTierId: null,
      storedKind: null,
      withdrawn: false,
    },
    // Partial money below the deposit: intent, not a place.
    {
      id: "insc-tomas",
      fullName: "Tomás Acosta",
      personKind: "dancer",
      academyId: sur.id,
      academyName: sur.name,
      participating: false,
      allocatedAmount: 10000,
      storedTierId: "precio-septiembre",
      storedKind: "nonParticipant",
      withdrawn: false,
    },
    {
      id: "insc-valentina",
      fullName: "Valentina Pereyra",
      personKind: "dancer",
      academyId: sur.id,
      academyName: sur.name,
      participating: true,
      allocatedAmount: 15000,
      storedTierId: "precio-septiembre",
      storedKind: "participant",
      withdrawn: false,
    },
    {
      id: "insc-sofia",
      fullName: "Sofía Medina",
      personKind: "dancer",
      academyId: sur.id,
      academyName: sur.name,
      participating: true,
      allocatedAmount: 30000,
      storedTierId: "precio-septiembre",
      storedKind: "participant",
      withdrawn: false,
    },
    {
      id: "insc-carla",
      fullName: "Carla Benítez",
      personKind: "professor",
      academyId: sur.id,
      academyName: sur.name,
      participating: true,
      allocatedAmount: 20000,
      storedTierId: "precio-septiembre",
      storedKind: "participant",
      withdrawn: false,
    },
    // Removed with money on it: withdrawn, keeps the money, frees the place.
    {
      id: "insc-joaquin",
      fullName: "Joaquín Ríos",
      personKind: "dancer",
      academyId: sur.id,
      academyName: sur.name,
      participating: false,
      allocatedAmount: 20000,
      storedTierId: "precio-septiembre",
      storedKind: "nonParticipant",
      withdrawn: true,
    },
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
        storedTierId: stage === 2 ? null : "precio-septiembre",
        storedKind: stage === 2 ? null : "participant",
        withdrawn: false,
      };
    }),
  );

  const seeds = [...surSeeds, ...otherSeeds];

  // A seminar with no tier registers but cannot be allocated against (#885), so
  // no row can hold money or a stored tier.
  return withMoney
    ? seeds
    : seeds
        .filter((seed) => !seed.withdrawn)
        .map((seed) => ({
          ...seed,
          allocatedAmount: 0,
          storedKind: null,
          storedTierId: null,
        }));
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
  const hasTiers = caseId !== "sin-precios";
  const rate = 50;
  const tiers = hasTiers ? julietaTiers : [];
  const inscriptions = buildSeeds(hasTiers).map((seed) =>
    deriveFigures(seed, tiers, rate),
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
    scheduledDate: "2026-10-12",
    startTime: "15:00",
    // "Lleno": the covered rows already fill the quota.
    quota: caseId === "lleno" ? coveredCount : 20,
    requiredDepositPercentage: rate,
    tiers,
    coveredCount,
    registeredCount,
  };

  const seminars: PrototypeSeminar[] = [
    seminar,
    {
      id: "seminario-martin",
      instructorName: "Martín Gómez",
      scheduledDate: "2026-10-13",
      startTime: "11:00",
      quota: 15,
      requiredDepositPercentage: 50,
      tiers: [],
      coveredCount: 6,
      registeredCount: 9,
    },
    {
      id: "seminario-ana",
      instructorName: "Ana Ferreyra",
      scheduledDate: "2026-10-14",
      startTime: "17:30",
      quota: 25,
      requiredDepositPercentage: 40,
      tiers: [],
      coveredCount: 0,
      registeredCount: 3,
    },
  ];

  const tierUsage: Record<string, TierUsage> = Object.fromEntries(
    tiers.map((tier) => [
      tier.id,
      {
        referencedCount: inscriptions.filter(
          (inscription) => inscription.storedTierId === tier.id,
        ).length,
        heldByCovered: inscriptions.some(
          (inscription) =>
            inscription.covered && inscription.storedTierId === tier.id,
        ),
      },
    ]),
  );

  const academyInscriptions = inscriptions.filter(
    (inscription) => inscription.academyId === prototypeAcademy.id,
  );

  const seminarUnitRows: SeminarUnitRow[] = [
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
    choreographyUnitRows,
    financeAccounts,
    inscriptions,
    seminar,
    seminarUnitRows,
    seminars,
    tierUsage,
  };
}
