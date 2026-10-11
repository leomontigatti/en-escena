import { describe, expect, test } from "vitest";

import {
  createSeminarPrice,
  type SeminarPriceInput,
} from "@/lib/seminar-prices/repository.server";

const participantTail: SeminarPriceInput = {
  name: "Precio participantes",
  kind: "regular",
  forParticipants: true,
  paymentDeadline: null,
  amount: 20000,
};

// A refusal answers before the duplicate check: one that reached the database
// would throw here, where none is configured.
describe("createSeminarPrice", () => {
  test("refuses an empty name, a malformed deadline and an amount below one", async () => {
    const eventId = crypto.randomUUID();

    await expect(
      createSeminarPrice(eventId, {
        ...participantTail,
        name: "  ",
        amount: 0,
        paymentDeadline: "30/06/2026",
      }),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid-event-bases",
      fieldErrors: {
        name: "Ingresá el nombre del precio.",
        amount: "Ingresá un monto mayor a cero.",
        paymentDeadline: "Elegí una fecha válida.",
      },
    });
    await expect(
      createSeminarPrice(eventId, { ...participantTail, kind: "premium" }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { kind: "Elegí un tipo de seminario." },
    });
  });
});
