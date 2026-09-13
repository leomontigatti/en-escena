/**
 * The write side of the money dialog on the `(seminar, academy)` financial
 * detail: the seminar twin of `inscription-allocation.server.ts`, gesture for
 * gesture — put an arbitrary amount on one inscription, take an arbitrary
 * amount off it, release exactly what it holds above its `Total`.
 *
 * It is a second module and not a branch inside the choreography one because
 * what differs is everything *around* the pool: which table the inscription
 * lives in, which list prices it, and what makes a price row a candidate. The
 * pool rules themselves are shared — `spreadFromPool` and `unwindToPool` take
 * the target and do not care which kind it names — and so are the three
 * refusals they raise.
 *
 * Two seminar-only facts shape this file:
 *
 * - **The candidate set is per person, not per seminar.** The participant cell
 *   is read on the roster row the inscription names, so two inscriptions of the
 *   same seminar can be offered different rows. That is why the options reader
 *   answers a map keyed by inscription rather than one list.
 * - **The deposit is the seminar's own rate**, never the event's, which is what
 *   `deriveSeminarInscriptionThresholds` already owns.
 *
 * There is **no `Descuento por bailarín`** on this side, so nothing here reads
 * the rest of the academy's roster.
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  dancers,
  professors,
  seminarInscriptions,
  seminarPrices,
  seminars,
} from "@/db/schema";
import {
  calculateDepositAmount,
  deriveInscriptionFinancialFigures,
  hasCrossedDepositThreshold,
} from "@/lib/finances/inscription-financial-status";
import { readEventParticipation } from "@/lib/participation/participation.server";
import {
  deriveSeminarInscriptionThresholds,
  selectSeminarPriceCandidates,
} from "@/lib/finances/seminar-inscription-price";
import {
  readSeminarInscriptionThresholds,
  type SeminarFinancePriceRow,
} from "@/lib/finances/seminar-inscription-thresholds.server";

import {
  readInscriptionAllocatedAmount,
  spreadFromPool,
  unwindToPool,
} from "./allocation-pool.server";
import {
  runCobro,
  type CobroResult,
  type Executor,
  type Transaction,
} from "./choreography-cobro-support.server";

/** A seminar price row the dialog may offer, with the `Seña` it implies. */
export type SeminarInscriptionPriceOption = {
  amount: number;
  depositAmount: number;
  id: string;
  name: string;
};

const seminarInscriptionNotFoundMessage = "No encontramos esa inscripción.";
const seminarNotFoundMessage = "No encontramos ese seminario.";

/**
 * What the money dialog offers each inscription of one seminar: the rows
 * **already filtered** to the seminar's kind (with its `regular` fallback) and
 * to the person's participant cell. Offering a foreign row would be offering to
 * create a state the model forbids, so the rows are filtered rather than
 * labelled.
 *
 * `paymentDeadline` is deliberately not a filter, exactly as on the choreography
 * side: the deadline decides which row applies when nobody has said, and here
 * somebody is saying it.
 */
export async function readSeminarInscriptionPriceOptions(input: {
  eventId: string;
  seminarId: string;
}): Promise<Map<string, SeminarInscriptionPriceOption[]>> {
  const options = new Map<string, SeminarInscriptionPriceOption[]>();
  const seminar = await readSeminarPricingRow(db, input.seminarId);

  if (!seminar || seminar.eventId !== input.eventId) {
    return options;
  }

  const [priceRows, inscriptionRows] = await Promise.all([
    db.query.seminarPrices.findMany({
      where: eq(seminarPrices.eventId, input.eventId),
    }),
    db
      .select({
        dancerId: seminarInscriptions.dancerId,
        id: seminarInscriptions.id,
        professorId: seminarInscriptions.professorId,
      })
      .from(seminarInscriptions)
      .where(eq(seminarInscriptions.seminarId, input.seminarId)),
  ]);
  const participation = await readEventParticipation(db, {
    dancerIds: collectIds(inscriptionRows, "dancerId"),
    eventId: input.eventId,
    professorIds: collectIds(inscriptionRows, "professorId"),
  });

  for (const inscription of inscriptionRows) {
    options.set(
      inscription.id,
      selectSeminarPriceCandidates({
        forParticipants: isParticipating(inscription, participation),
        priceRows,
        seminarKind: seminar.kind,
      })
        .map((price) => ({
          amount: price.amount,
          depositAmount: calculateDepositAmount({
            priceAmount: price.amount,
            requiredDepositPercentage: seminar.requiredDepositPercentage,
          }),
          id: price.id,
          name: price.name,
        }))
        .sort((left, right) => left.amount - right.amount),
    );
  }

  return options;
}

export type SeminarInscriptionMoneyInput = {
  academyId: string;
  eventId: string;
  inscriptionId: string;
  seminarId: string;
};

/**
 * Puts an arbitrary amount on one seminar inscription, out of the academy's
 * `Saldo disponible`. `priceId` is honoured only while the row has not covered
 * its deposit; from the crossing on a different row is refused, and the database
 * trigger holds the same rule underneath.
 */
export async function allocateToSeminarInscription(
  input: SeminarInscriptionMoneyInput & {
    amount: number;
    priceId: string | null;
  },
): Promise<CobroResult> {
  return await runCobro(async (tx) => {
    const context = await loadSeminarMoneyContext(tx, input);
    if (!context.ok) {
      return context;
    }

    const priced = await applySelectedSeminarPrice(tx, {
      allocatedAmount: await readInscriptionAllocatedAmount(tx, {
        id: input.inscriptionId,
        kind: "seminar",
      }),
      eventId: input.eventId,
      inscription: context.inscription,
      priceId: input.priceId,
      seminar: context.seminar,
    });
    if (!priced.ok) {
      return priced;
    }

    return await spreadFromPool(tx, {
      academyId: input.academyId,
      amount: input.amount,
      eventId: input.eventId,
      target: { id: input.inscriptionId, kind: "seminar" },
    });
  });
}

/**
 * Takes an arbitrary amount off one seminar inscription and returns it to the
 * academy's `Saldo disponible`. Nothing here refuses on financial grounds, and
 * dropping back below the deposit is what opens the price lock again.
 */
export async function removeFromSeminarInscription(
  input: SeminarInscriptionMoneyInput & { amount: number },
): Promise<CobroResult> {
  return await runCobro(async (tx) => {
    const context = await loadSeminarMoneyContext(tx, input);
    if (!context.ok) {
      return context;
    }

    return await unwindToPool(tx, {
      academyId: input.academyId,
      amount: input.amount,
      eventId: input.eventId,
      target: { id: input.inscriptionId, kind: "seminar" },
    });
  });
}

/** Releases **exactly** what the inscription holds above its `Total`. */
export async function releaseSeminarInscriptionExcess(
  input: SeminarInscriptionMoneyInput,
): Promise<CobroResult> {
  return await runCobro(async (tx) => {
    const context = await loadSeminarMoneyContext(tx, input);
    if (!context.ok) {
      return context;
    }

    const thresholds = await readSeminarInscriptionThresholds(tx, {
      academyId: input.academyId,
      eventId: input.eventId,
      inscriptionIds: [input.inscriptionId],
    });
    const inscriptionThresholds = thresholds.get(input.inscriptionId);

    if (!inscriptionThresholds) {
      return { ok: false, message: seminarInscriptionNotFoundMessage };
    }

    const figures = deriveInscriptionFinancialFigures({
      allocatedAmount: await readInscriptionAllocatedAmount(tx, {
        id: input.inscriptionId,
        kind: "seminar",
      }),
      thresholds: inscriptionThresholds,
    });

    if (!figures.overAllocatedAmount) {
      return {
        ok: false,
        message: "Esta inscripción no tiene excedente para liberar.",
      };
    }

    return await unwindToPool(tx, {
      academyId: input.academyId,
      amount: figures.overAllocatedAmount,
      eventId: input.eventId,
      target: { id: input.inscriptionId, kind: "seminar" },
    });
  });
}

/**
 * The price the money lands against, seminar side. Below the deposit of the
 * **stored** row the chosen candidate is written; from the crossing on the price
 * is locked and a different row is refused with the way out named.
 */
async function applySelectedSeminarPrice(
  tx: Transaction,
  input: {
    allocatedAmount: number;
    eventId: string;
    inscription: {
      forParticipants: boolean;
      id: string;
      selectedPriceId: string | null;
    };
    priceId: string | null;
    seminar: SeminarPricingRow;
  },
): Promise<CobroResult> {
  const crossed = await hasCrossedStoredSeminarDepositThreshold(tx, {
    allocatedAmount: input.allocatedAmount,
    requiredDepositPercentage: input.seminar.requiredDepositPercentage,
    selectedPriceId: input.inscription.selectedPriceId,
  });

  if (crossed) {
    if (
      input.priceId !== null &&
      input.priceId !== input.inscription.selectedPriceId
    ) {
      return {
        ok: false,
        message:
          "El precio queda fijo desde que la inscripción cubre su seña. Para cambiarlo hay que quitarle dinero hasta dejarla por debajo de la seña.",
      };
    }

    return { ok: true };
  }

  if (input.priceId === null) {
    return input.inscription.selectedPriceId === null &&
      input.allocatedAmount === 0
      ? { ok: false, message: "Elegí un precio para la inscripción." }
      : { ok: true };
  }

  const priceRows = await tx.query.seminarPrices.findMany({
    where: eq(seminarPrices.eventId, input.eventId),
  });
  const candidate = selectSeminarPriceCandidates({
    forParticipants: input.inscription.forParticipants,
    priceRows,
    seminarKind: input.seminar.kind,
  }).find((price) => price.id === input.priceId);

  if (!candidate) {
    return { ok: false, message: "No encontramos esa fila de precio." };
  }

  await tx
    .update(seminarInscriptions)
    .set({ selectedPriceId: candidate.id })
    .where(eq(seminarInscriptions.id, input.inscription.id));

  return { ok: true };
}

/**
 * Whether the inscription has crossed the deposit of the row it **stores**, at
 * the seminar's own rate. The stored row and not the effective one: asking
 * whether today's row was crossed is the circularity the rule exists to avoid.
 */
async function hasCrossedStoredSeminarDepositThreshold(
  executor: Executor,
  input: {
    allocatedAmount: number;
    requiredDepositPercentage: number;
    selectedPriceId: string | null;
  },
): Promise<boolean> {
  if (input.selectedPriceId === null) {
    return false;
  }

  const stored = await executor.query.seminarPrices.findFirst({
    columns: { amount: true },
    where: eq(seminarPrices.id, input.selectedPriceId),
  });

  if (!stored) {
    return false;
  }

  return hasCrossedDepositThreshold({
    allocatedAmount: input.allocatedAmount,
    depositAmount: deriveSeminarInscriptionThresholds({
      priceAmount: stored.amount,
      requiredDepositPercentage: input.requiredDepositPercentage,
    }).depositAmount,
  });
}

type SeminarPricingRow = {
  eventId: string;
  kind: SeminarFinancePriceRow["kind"];
  requiredDepositPercentage: number;
};

type SeminarMoneyContext =
  | { ok: false; message: string }
  | {
      ok: true;
      inscription: {
        forParticipants: boolean;
        id: string;
        selectedPriceId: string | null;
      };
      seminar: SeminarPricingRow;
    };

/**
 * Resolves the inscription against the seminar, the academy and the event of the
 * request, so a form cannot move money onto a row that belongs to another
 * screen. The academy is read **through the person**, as it is everywhere else
 * on this side.
 */
async function loadSeminarMoneyContext(
  tx: Transaction,
  input: SeminarInscriptionMoneyInput,
): Promise<SeminarMoneyContext> {
  const seminar = await readSeminarPricingRow(tx, input.seminarId);

  if (!seminar || seminar.eventId !== input.eventId) {
    return { ok: false, message: seminarNotFoundMessage };
  }

  const [inscription] = await tx
    .select({
      dancerId: seminarInscriptions.dancerId,
      id: seminarInscriptions.id,
      professorId: seminarInscriptions.professorId,
      selectedPriceId: seminarInscriptions.selectedPriceId,
    })
    .from(seminarInscriptions)
    .where(
      and(
        eq(seminarInscriptions.id, input.inscriptionId),
        eq(seminarInscriptions.seminarId, input.seminarId),
      ),
    )
    .limit(1);

  if (!inscription) {
    return { ok: false, message: seminarInscriptionNotFoundMessage };
  }

  const personAcademyId = await readPersonAcademyId(tx, inscription);

  if (personAcademyId !== input.academyId) {
    return { ok: false, message: seminarInscriptionNotFoundMessage };
  }

  const participation = await readEventParticipation(tx, {
    dancerIds: collectIds([inscription], "dancerId"),
    eventId: input.eventId,
    professorIds: collectIds([inscription], "professorId"),
  });

  return {
    ok: true,
    inscription: {
      forParticipants: isParticipating(inscription, participation),
      id: inscription.id,
      selectedPriceId: inscription.selectedPriceId,
    },
    seminar,
  };
}

async function readSeminarPricingRow(
  executor: Executor,
  seminarId: string,
): Promise<SeminarPricingRow | null> {
  const seminar = await executor.query.seminars.findFirst({
    columns: { eventId: true, kind: true, requiredDepositPercentage: true },
    where: eq(seminars.id, seminarId),
  });

  return seminar ?? null;
}

async function readPersonAcademyId(
  executor: Executor,
  inscription: { dancerId: string | null; professorId: string | null },
): Promise<string | null> {
  if (inscription.dancerId !== null) {
    const dancer = await executor.query.dancers.findFirst({
      columns: { academyId: true },
      where: eq(dancers.id, inscription.dancerId),
    });

    return dancer?.academyId ?? null;
  }

  if (inscription.professorId !== null) {
    const professor = await executor.query.professors.findFirst({
      columns: { academyId: true },
      where: eq(professors.id, inscription.professorId),
    });

    return professor?.academyId ?? null;
  }

  return null;
}

function collectIds(
  rows: readonly { dancerId: string | null; professorId: string | null }[],
  column: "dancerId" | "professorId",
): string[] {
  return [
    ...new Set(
      rows
        .map((row) => row[column])
        .filter((personId): personId is string => personId !== null),
    ),
  ];
}

function isParticipating(
  row: { dancerId: string | null; professorId: string | null },
  participation: { dancerIds: Set<string>; professorIds: Set<string> },
): boolean {
  return row.dancerId !== null
    ? participation.dancerIds.has(row.dancerId)
    : row.professorId !== null &&
        participation.professorIds.has(row.professorId);
}
