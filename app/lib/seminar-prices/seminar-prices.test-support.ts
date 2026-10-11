import { createSeminarPrice } from "@/lib/seminar-prices/repository.server";
import {
  getParticipantCellLabel,
  participantCellValues,
} from "@/lib/seminar-prices/participant-cells";

/**
 * The minimum price list an event needs before its seminars can be registered
 * into: the deadline-less `Común` row of both participant cells. Every fixture
 * whose subject is not the price list itself seeds it through this, so that
 * "the event has no prices" stays a state a test asks for on purpose.
 */
export async function createSeminarRegistrationPrices(
  eventId: string,
  amount = 20000,
) {
  for (const forParticipants of participantCellValues) {
    const result = await createSeminarPrice(eventId, {
      name: `Precio ${getParticipantCellLabel(forParticipants)}`,
      kind: "regular",
      forParticipants,
      paymentDeadline: null,
      amount: forParticipants ? amount : amount + 10000,
    });

    if (!result.ok) {
      throw new Error(`Expected the seminar price: ${result.error}`);
    }
  }
}
