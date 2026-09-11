// PROTOTYPE — throwaway, lives only on branch `prototype/891-seminar-money-portal`.
//
// In-memory data for the portal seminar-money prototype of wayfinder ticket #891
// (map #884): one academy (`Estudio Danza Sur`) with its roster, three seminars
// of the active event holding the academy's inscriptions, and the academy's
// finance units. Every figure is derived with the rules the map already decided
// — event-level seminar prices, the kind fallback and the deposit (#904), the
// participant reading (#887), covered and places left (#888), the withdrawn row
// (#889) — with the price model copied from the admin prototype of #890.
import {
  deriveChoreographyFinancialStatus,
  deriveInscriptionFinancialStatus,
  type InscriptionFinancialStatus,
} from "@/lib/finances/inscription-financial-status";
import type { OperationalFinanceAmount } from "@/lib/finances/operational-summary";
import type { ChoreographyGroupType } from "@/lib/portal/choreographies";

/** The business date the prototype reads prices against. */
export const prototypeToday = "2026-09-10";

export const prototypeCaseIds = ["normal", "lleno", "comenzado"] as const;
export type PrototypeCaseId = (typeof prototypeCaseIds)[number];

/** The seminar every case acts on. */
export const targetSeminarId = "seminario-julieta";

type SeminarKind = "regular" | "special";

export type SeminarPriceRow = {
  id: string;
  name: string;
  kind: SeminarKind;
  forParticipants: boolean;
  paymentDeadline: string | null;
  amount: number;
};

// No `Exclusivo` row for non-participants: an `Exclusivo` seminar prices them
// through the `Común` rows. The two participant cells move on different dates
// so the card has to decide which deadline it shows.
const eventSeminarPrices: SeminarPriceRow[] = [
  {
    id: "comun-participantes-septiembre",
    name: "Participantes preventa",
    kind: "regular",
    forParticipants: true,
    paymentDeadline: "2026-09-20",
    amount: 30000,
  },
  {
    id: "comun-participantes-octubre",
    name: "Participantes octubre",
    kind: "regular",
    forParticipants: true,
    paymentDeadline: "2026-10-05",
    amount: 35000,
  },
  {
    id: "comun-participantes-sin-fecha",
    name: "Participantes",
    kind: "regular",
    forParticipants: true,
    paymentDeadline: null,
    amount: 40000,
  },
  {
    id: "comun-no-participantes-septiembre",
    name: "Público preventa",
    kind: "regular",
    forParticipants: false,
    paymentDeadline: "2026-09-15",
    amount: 40000,
  },
  {
    id: "comun-no-participantes-sin-fecha",
    name: "Público general",
    kind: "regular",
    forParticipants: false,
    paymentDeadline: null,
    amount: 50000,
  },
  {
    id: "exclusivo-participantes-septiembre",
    name: "Exclusivo participantes preventa",
    kind: "special",
    forParticipants: true,
    paymentDeadline: "2026-09-20",
    amount: 45000,
  },
  {
    id: "exclusivo-participantes-sin-fecha",
    name: "Exclusivo participantes",
    kind: "special",
    forParticipants: true,
    paymentDeadline: null,
    amount: 55000,
  },
];

export function formatSeminarKindLabel(kind: SeminarKind) {
  return kind === "special" ? "Exclusivo" : "Común";
}

export function depositFor(amount: number, rate: number) {
  return Math.round((amount * rate) / 100);
}

const deadlineFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export function formatPriceDeadline(deadline: string | null) {
  return deadline === null
    ? "Sin fecha límite"
    : `Hasta el ${deadlineFormatter.format(new Date(`${deadline}T00:00:00Z`))}`;
}

function compareDeadlines(left: string | null, right: string | null) {
  if (left === right) {
    return 0;
  }

  if (left === null) {
    return 1;
  }

  return right === null ? -1 : left.localeCompare(right);
}

function selectApplicable(rows: SeminarPriceRow[]) {
  return (
    rows
      .filter(
        (row) =>
          row.paymentDeadline === null || row.paymentDeadline >= prototypeToday,
      )
      .sort((left, right) =>
        compareDeadlines(left.paymentDeadline, right.paymentDeadline),
      )[0] ?? null
  );
}

/** Today's row for a kind and a participant fact, falling back to `Común` (#904). */
function resolveCurrentSeminarPrice(kind: SeminarKind, participating: boolean) {
  const cell = eventSeminarPrices.filter(
    (row) => row.forParticipants === participating,
  );
  const ofKind =
    kind === "regular"
      ? null
      : selectApplicable(cell.filter((row) => row.kind === kind));

  return (
    ofKind ?? selectApplicable(cell.filter((row) => row.kind === "regular"))
  );
}

export type RosterPerson = {
  id: string;
  fullName: string;
  kind: "dancer" | "professor";
  /** The per-event `Participando` predicate, read on the roster row (#887). */
  participating: boolean;
};

const roster: RosterPerson[] = [
  {
    id: "lucia",
    fullName: "Lucía Fernández",
    kind: "dancer",
    participating: true,
  },
  {
    id: "tomas",
    fullName: "Tomás Acosta",
    kind: "dancer",
    participating: false,
  },
  {
    id: "valentina",
    fullName: "Valentina Pereyra",
    kind: "dancer",
    participating: true,
  },
  {
    id: "sofia",
    fullName: "Sofía Medina",
    kind: "dancer",
    participating: true,
  },
  {
    id: "carla",
    fullName: "Carla Benítez",
    kind: "professor",
    participating: true,
  },
  {
    id: "martina",
    fullName: "Martina Quiroga",
    kind: "dancer",
    participating: false,
  },
  {
    id: "joaquin",
    fullName: "Joaquín Ríos",
    kind: "dancer",
    participating: false,
  },
  {
    id: "nicolas",
    fullName: "Nicolás Paredes",
    kind: "dancer",
    participating: true,
  },
  {
    id: "rocio",
    fullName: "Rocío Álvarez",
    kind: "dancer",
    participating: false,
  },
  { id: "abril", fullName: "Abril Sosa", kind: "dancer", participating: true },
  { id: "bruno", fullName: "Bruno Paz", kind: "dancer", participating: false },
  {
    id: "diego",
    fullName: "Diego Luna",
    kind: "professor",
    participating: false,
  },
];

function findPerson(personId: string) {
  const person = roster.find((candidate) => candidate.id === personId);

  if (!person) {
    throw new Error(`Prototipo: no hay nadie con id ${personId}.`);
  }

  return person;
}

type InscriptionSeed = {
  id: string;
  personId: string;
  allocatedAmount: number;
  storedPriceId: string | null;
  withdrawn: boolean;
};

export type SeminarInscriptionFigures = {
  id: string;
  person: RosterPerson;
  allocatedAmount: number;
  withdrawn: boolean;
  /** Holds a place: deposit crossed against the stored row, not withdrawn (#888). */
  covered: boolean;
  price: SeminarPriceRow | null;
  /** Participant as priced: the stored row once covered, the roster below it (#904). */
  readAsParticipant: boolean;
  depositAmount: number | null;
  totalAmount: number | null;
  owedDepositAmount: number | null;
  owedBalanceAmount: number | null;
  financialStatus: InscriptionFinancialStatus;
};

export type PortalMoneySeminar = {
  id: string;
  instructorName: string;
  kind: SeminarKind;
  scheduledDate: string;
  startTime: string;
  requiredDepositPercentage: number;
  quota: number;
  /** Every academy's covered rows, which is what fills the quota. */
  coveredCount: number;
  hasStarted: boolean;
  /** Today's row of each participant cell, through the kind fallback. */
  currentPrices: {
    participants: SeminarPriceRow | null;
    nonParticipants: SeminarPriceRow | null;
  };
  /** The academy's inscriptions, withdrawn ones included; the card lists only the active ones (#889). */
  inscriptions: SeminarInscriptionFigures[];
};

export type RegistrablePerson = {
  person: RosterPerson;
  price: SeminarPriceRow | null;
  depositAmount: number | null;
  /** Money on a withdrawn row of the same person, which registering revives (#889). */
  revivedAllocatedAmount: number;
};

function deriveFigures(
  seed: InscriptionSeed,
  kind: SeminarKind,
  rate: number,
): SeminarInscriptionFigures {
  const person = findPerson(seed.personId);
  const stored =
    eventSeminarPrices.find((row) => row.id === seed.storedPriceId) ?? null;
  const storedDeposit = stored ? depositFor(stored.amount, rate) : null;
  const crossed =
    storedDeposit !== null &&
    seed.allocatedAmount > 0 &&
    seed.allocatedAmount >= storedDeposit;
  const price = crossed
    ? stored
    : (resolveCurrentSeminarPrice(kind, person.participating) ?? stored);
  const base = {
    id: seed.id,
    person,
    allocatedAmount: seed.allocatedAmount,
    withdrawn: seed.withdrawn,
    covered: crossed && !seed.withdrawn,
    price,
    readAsParticipant: price?.forParticipants ?? person.participating,
  };

  if (seed.withdrawn) {
    return {
      ...base,
      depositAmount: seed.allocatedAmount,
      financialStatus: "paidInFull",
      owedBalanceAmount: 0,
      owedDepositAmount: 0,
      totalAmount: seed.allocatedAmount,
    };
  }

  const totalAmount = price?.amount ?? null;
  const depositAmount =
    totalAmount === null ? null : depositFor(totalAmount, rate);

  return {
    ...base,
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
    totalAmount,
  };
}

function inscription(
  id: string,
  personId: string,
  allocatedAmount: number,
  storedPriceId: string | null,
  withdrawn = false,
): InscriptionSeed {
  return { id, personId, allocatedAmount, storedPriceId, withdrawn };
}

const seminarSeeds = [
  {
    id: targetSeminarId,
    instructorName: "Julieta Ruiz",
    kind: "special" as SeminarKind,
    scheduledDate: "2026-10-12",
    startTime: "15:00",
    requiredDepositPercentage: 50,
    quota: 20,
    otherCoveredCount: 9,
    inscriptions: [
      // Nothing on it yet: reads today's `Exclusivo` participant row.
      inscription("julieta-lucia", "lucia", 0, null),
      // Not participating: no `Exclusivo` row for the cell, so the `Común` one.
      inscription(
        "julieta-tomas",
        "tomas",
        10000,
        "comun-no-participantes-septiembre",
      ),
      // Partial money below the deposit: intent, not a place.
      inscription(
        "julieta-valentina",
        "valentina",
        15000,
        "exclusivo-participantes-septiembre",
      ),
      inscription(
        "julieta-sofia",
        "sofia",
        25000,
        "exclusivo-participantes-septiembre",
      ),
      inscription(
        "julieta-carla",
        "carla",
        45000,
        "exclusivo-participantes-septiembre",
      ),
      // Covered as a participant, no longer participating: the stored row wins.
      inscription(
        "julieta-martina",
        "martina",
        22500,
        "exclusivo-participantes-septiembre",
      ),
      // Removed with money on it: withdrawn, keeps the money, frees the place.
      inscription(
        "julieta-joaquin",
        "joaquin",
        20000,
        "comun-no-participantes-septiembre",
        true,
      ),
    ],
  },
  {
    id: "seminario-martin",
    instructorName: "Martín Gómez",
    kind: "regular" as SeminarKind,
    scheduledDate: "2026-10-13",
    startTime: "11:00",
    requiredDepositPercentage: 50,
    quota: 15,
    otherCoveredCount: 6,
    inscriptions: [
      inscription(
        "martin-nicolas",
        "nicolas",
        15000,
        "comun-participantes-septiembre",
      ),
      inscription("martin-rocio", "rocio", 0, null),
      inscription("martin-carla", "carla", 0, null),
    ],
  },
  {
    id: "seminario-ana",
    instructorName: "Ana Ferreyra",
    kind: "regular" as SeminarKind,
    scheduledDate: "2026-10-14",
    startTime: "17:30",
    requiredDepositPercentage: 40,
    quota: 25,
    otherCoveredCount: 0,
    inscriptions: [],
  },
];

export function isSeminarFull(seminar: PortalMoneySeminar) {
  return seminar.coveredCount >= seminar.quota;
}

export function listActiveInscriptions(seminar: PortalMoneySeminar) {
  return seminar.inscriptions.filter((row) => !row.withdrawn);
}

/** The picker's people: the roster minus those already actively registered. */
export function listRegistrablePeople(
  seminar: PortalMoneySeminar,
): RegistrablePerson[] {
  return roster
    .filter(
      (person) =>
        !seminar.inscriptions.some(
          (row) => !row.withdrawn && row.person.id === person.id,
        ),
    )
    .map((person) => {
      const withdrawnRow = seminar.inscriptions.find(
        (row) => row.withdrawn && row.person.id === person.id,
      );
      const price =
        withdrawnRow?.price ??
        resolveCurrentSeminarPrice(seminar.kind, person.participating);

      return {
        person,
        price,
        depositAmount: price
          ? depositFor(price.amount, seminar.requiredDepositPercentage)
          : null,
        revivedAllocatedAmount: withdrawnRow?.allocatedAmount ?? 0,
      };
    });
}

/** A revival that would retake a place the seminar no longer has (#889). */
export function isRevivalRefused(
  seminar: PortalMoneySeminar,
  personId: string,
) {
  const row = seminar.inscriptions.find(
    (candidate) => candidate.withdrawn && candidate.person.id === personId,
  );

  if (!row?.price) {
    return false;
  }

  return (
    row.allocatedAmount >=
      depositFor(row.price.amount, seminar.requiredDepositPercentage) &&
    isSeminarFull(seminar)
  );
}

export type FigureTotals = {
  depositAmount: OperationalFinanceAmount;
  totalAmount: OperationalFinanceAmount;
  owedBalanceAmount: OperationalFinanceAmount;
  owedDepositAmount: OperationalFinanceAmount;
};

function sumAmounts(values: Array<number | null>): OperationalFinanceAmount {
  const missingPriceCount = values.filter((value) => value === null).length;
  const amount = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);

  return missingPriceCount > 0
    ? { amount, missingPriceCount, status: "incomplete" }
    : { amount, status: "complete" };
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
    : { amount, status: "complete" };
}

/** A unit's figures: withdrawn rows stay in the money rollup (#889). */
export function summarizeSeminarInscriptions(
  rows: SeminarInscriptionFigures[],
): FigureTotals {
  return {
    depositAmount: sumAmounts(rows.map((row) => row.depositAmount)),
    totalAmount: sumAmounts(rows.map((row) => row.totalAmount)),
    owedBalanceAmount: sumAmounts(rows.map((row) => row.owedBalanceAmount)),
    owedDepositAmount: sumAmounts(rows.map((row) => row.owedDepositAmount)),
  };
}

function addTotals(rows: FigureTotals[]): FigureTotals {
  return {
    depositAmount: addAmounts(rows.map((row) => row.depositAmount)),
    totalAmount: addAmounts(rows.map((row) => row.totalAmount)),
    owedBalanceAmount: addAmounts(rows.map((row) => row.owedBalanceAmount)),
    owedDepositAmount: addAmounts(rows.map((row) => row.owedDepositAmount)),
  };
}

export type ChoreographyUnitRow = FigureTotals & {
  id: string;
  choreographyNumber: number;
  name: string;
  groupType: ChoreographyGroupType;
  financialStatus: InscriptionFinancialStatus;
};

export type SeminarUnitRow = FigureTotals & {
  id: string;
  instructorName: string;
  scheduledDate: string;
  startTime: string;
  inscriptionCount: number;
  financialStatus: InscriptionFinancialStatus;
};

export type SeminarInscriptionLine = SeminarInscriptionFigures & {
  seminarId: string;
  instructorName: string;
  scheduledDate: string;
};

function complete(amount: number): OperationalFinanceAmount {
  return { amount, status: "complete" };
}

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

export function buildPrototypeData(caseId: PrototypeCaseId) {
  const seminars: PortalMoneySeminar[] = seminarSeeds.map((seed) => {
    const inscriptions = seed.inscriptions.map((row) =>
      deriveFigures(row, seed.kind, seed.requiredDepositPercentage),
    );
    const coveredCount =
      seed.otherCoveredCount + inscriptions.filter((row) => row.covered).length;
    const isTarget = seed.id === targetSeminarId;

    return {
      id: seed.id,
      instructorName: seed.instructorName,
      kind: seed.kind,
      scheduledDate: seed.scheduledDate,
      startTime: seed.startTime,
      requiredDepositPercentage: seed.requiredDepositPercentage,
      // "Lleno": the covered rows already fill the quota.
      quota: isTarget && caseId === "lleno" ? coveredCount : seed.quota,
      coveredCount,
      hasStarted: isTarget && caseId === "comenzado",
      currentPrices: {
        participants: resolveCurrentSeminarPrice(seed.kind, true),
        nonParticipants: resolveCurrentSeminarPrice(seed.kind, false),
      },
      inscriptions,
    };
  });

  const seminarUnitRows: SeminarUnitRow[] = seminars
    .filter((seminar) => seminar.inscriptions.length > 0)
    .map((seminar) => ({
      id: seminar.id,
      instructorName: seminar.instructorName,
      scheduledDate: seminar.scheduledDate,
      startTime: seminar.startTime,
      inscriptionCount: listActiveInscriptions(seminar).length,
      ...summarizeSeminarInscriptions(seminar.inscriptions),
      // The unit's state is the minimum of its active rows, as a choreography's is.
      financialStatus: deriveChoreographyFinancialStatus(
        listActiveInscriptions(seminar).map((row) => row.financialStatus),
      ),
    }));

  const seminarInscriptionLines: SeminarInscriptionLine[] = seminars.flatMap(
    (seminar) =>
      seminar.inscriptions.map((row) => ({
        ...row,
        seminarId: seminar.id,
        instructorName: seminar.instructorName,
        scheduledDate: seminar.scheduledDate,
      })),
  );

  const choreographies = addTotals(choreographyUnitRows);
  const seminarTotals = addTotals(seminarUnitRows);

  return {
    academyName: "Estudio Danza Sur",
    availableBalanceAmount: 45000,
    choreographyUnitRows,
    seminarInscriptionLines,
    seminarUnitRows,
    seminars,
    // Academy-scope figures sum both kinds (#886).
    summaries: {
      all: addTotals([choreographies, seminarTotals]),
      choreographies,
      seminars: seminarTotals,
    },
  };
}

export type PortalSeminarMoneyPrototypeData = ReturnType<
  typeof buildPrototypeData
>;

export function getTargetSeminar(data: PortalSeminarMoneyPrototypeData) {
  const seminar = data.seminars.find((row) => row.id === targetSeminarId);

  if (!seminar) {
    throw new Error("Prototipo: falta el seminario de Julieta Ruiz.");
  }

  return seminar;
}
