import { db } from "@/db";
import { payments } from "@/db/schema";
import {
  allocateToSeminarInscription,
  readSeminarInscriptionPriceOptions,
} from "@/lib/finances/seminar-inscription-allocation.server";

let fixturePaymentNumber = 0;

/**
 * Takes a place in a seminar the way the domain takes one: **with money**. It
 * reads the price the inscription may be charged, registers a payment for that
 * exact deposit and allocates it, so every guard that asks "is this inscription
 * covered?" answers off the database instead of off a stub.
 *
 * It exists because the covered count is not a fact a suite can assert around by
 * mocking `covered-inscriptions.server`: that module is ours, and a suite that
 * stubs it stops seeing the rule it is testing against
 * (`.sandcastle/CODING_STANDARDS.md`, "Testing"). The price list the event needs
 * first comes from `createSeminarRegistrationPrices`.
 */
export async function coverSeminarInscriptionDeposit(input: {
  academyId: string;
  eventId: string;
  inscriptionId: string;
  seminarId: string;
}) {
  const optionsByInscription = await readSeminarInscriptionPriceOptions({
    eventId: input.eventId,
    seminarId: input.seminarId,
  });
  const [price] = optionsByInscription.get(input.inscriptionId) ?? [];

  if (!price) {
    throw new Error(
      `Expected a seminar price for inscription ${input.inscriptionId}. Seed the event's price list first.`,
    );
  }

  fixturePaymentNumber += 1;
  await db.insert(payments).values({
    academyId: input.academyId,
    amount: price.depositAmount,
    eventId: input.eventId,
    paymentDate: "2026-04-01",
    paymentMethod: "transferencia",
    paymentNumber: fixturePaymentNumber,
  });

  // Exactly the deposit: the crossing is what takes the place, and stopping at
  // it keeps the row `Seña cubierta` rather than fully paid.
  const allocated = await allocateToSeminarInscription({
    academyId: input.academyId,
    amount: price.depositAmount,
    eventId: input.eventId,
    inscriptionId: input.inscriptionId,
    priceId: price.id,
    seminarId: input.seminarId,
  });

  if (!allocated.ok) {
    throw new Error(
      `Expected the seminar deposit to be covered: ${allocated.message}`,
    );
  }

  return price;
}
