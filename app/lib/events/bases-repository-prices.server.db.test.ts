import { describe, expect, test } from "vitest";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { prices } from "@/db/schema";
import { freezeInscriptionDepositForTest } from "@/features/portal/choreographies/test-support/db";
import { createModality } from "@/lib/modalities/repository.server";
import { createAccountCurrentChoreographyFixture } from "@/lib/admin/academies/account-current-route.test-support";
import {
  createPrice,
  deletePrice,
  listPrices,
  resolveApplicablePrice,
  updatePrice,
} from "@/lib/prices/repository.server";
import { deleteSchedule } from "@/lib/schedules/repository.server";
import {
  createEventPriceFixture,
  createSavedEvent,
  createSavedPrice,
  createSavedSchedule,
  expectCreated,
} from "@/lib/events/bases-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("Bases del evento repository", () => {
  test("keeps precios unique by evento and rejects cronogramas from another evento", async () => {
    const firstEvent = await createSavedEvent("Regional 2026");
    const secondEvent = await createSavedEvent("Final 2026");
    const jazz = await expectCreated(
      createModality(firstEvent.id, { name: "Jazz" }),
    );
    const otherEventModality = await expectCreated(
      createModality(secondEvent.id, { name: "Jazz" }),
    );
    const block = await createSavedSchedule(firstEvent.id, {
      modalityIds: [jazz.id],
    });
    const otherEventBlock = await createSavedSchedule(secondEvent.id, {
      modalityIds: [otherEventModality.id],
      scheduledDate: "2026-06-02",
      startTime: "11:00",
      totalCapacity: 10,
    });

    await createSavedPrice(firstEvent.id);
    await createSavedPrice(firstEvent.id, {
      amount: 15000,
      name: "Precio bloque",
      scheduleId: block.id,
    });
    await expect(deleteSchedule(block.id)).resolves.toMatchObject({
      ok: false,
      error: "No se puede borrar el cronograma porque tiene dependencias.",
    });
    await expect(
      createPrice(secondEvent.id, {
        groupType: "solo",
        amount: 9000,
        paymentDeadline: "2026-06-30",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      createPrice(firstEvent.id, {
        groupType: "solo",
        amount: 13000,
        paymentDeadline: "2026-05-31",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Ya existe un precio general para ese tipo de grupo.",
      fieldErrors: { groupType: "Revisá el tipo de grupo del precio." },
    });
    await expect(
      createPrice(firstEvent.id, {
        groupType: "solo",
        amount: 13000,
        paymentDeadline: "2026-05-31",
        scheduleId: otherEventBlock.id,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: "Elegí un cronograma del evento activo.",
      fieldErrors: {
        scheduleId: "Elegí un cronograma del evento activo.",
      },
    });
  });

  test("resolves the applicable precio by cronograma specificity and payment deadline", async () => {
    const { event, schedule: block } = await createEventPriceFixture();
    const general = await createSavedPrice(event.id);
    const specific = await createSavedPrice(event.id, {
      amount: 15000,
      name: "Precio bloque",
      scheduleId: block.id,
    });
    await expect(
      resolveApplicablePrice({
        eventId: event.id,
        groupType: "solo",
        scheduleId: block.id,
      }),
    ).resolves.toMatchObject({
      ok: true,
      price: { id: specific.id, amount: 15000 },
    });
    const laterGeneral = await createSavedPrice(event.id, {
      amount: 17000,
      name: "Precio segunda fecha",
      paymentDeadline: "2026-06-30",
    });
    await expect(
      resolveApplicablePrice({
        eventId: event.id,
        groupType: "solo",
        paymentDate: "2026-06-10",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({
      ok: true,
      price: { id: laterGeneral.id, amount: 17000 },
    });
    await expect(
      resolveApplicablePrice({
        eventId: event.id,
        groupType: "solo",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({
      ok: true,
      price: { id: general.id, amount: 12000 },
    });
    await expect(
      resolveApplicablePrice({
        eventId: event.id,
        groupType: "duo",
        scheduleId: block.id,
      }),
    ).resolves.toEqual({
      ok: false,
      code: "missing-price",
      error:
        "No hay un precio configurado para este tipo de grupo y cronograma.",
    });
  });

  test("lists precios with cronograma scope and blocks dependent updates and deletes", async () => {
    const { event, schedule: block } = await createEventPriceFixture();
    const general = await createSavedPrice(event.id);
    await createSavedPrice(event.id, {
      amount: 15000,
      name: "Precio bloque",
      scheduleId: block.id,
    });
    await createSavedPrice(event.id, {
      amount: 17000,
      name: "Precio segunda fecha",
      paymentDeadline: "2026-06-30",
    });

    await expect(listPrices(event.id)).resolves.toMatchObject([
      {
        eventId: event.id,
        paymentDeadline: "2026-05-31",
        schedule: { name: "Sábado Mañana" },
      },
      {
        eventId: event.id,
        paymentDeadline: "2026-05-31",
        schedule: null,
      },
      {
        eventId: event.id,
        paymentDeadline: "2026-06-30",
        schedule: null,
      },
    ]);

    await expect(
      updatePrice(
        general.id,
        {
          groupType: "solo",
          amount: 12000,
          paymentDeadline: "2026-05-31",
          scheduleId: null,
        },
        { hasDependencies: async () => true },
      ),
    ).resolves.toMatchObject({
      ok: true,
      record: { amount: 12000 },
    });
    await expect(
      updatePrice(
        general.id,
        {
          groupType: "solo",
          amount: 14000,
          paymentDeadline: "2026-05-31",
          scheduleId: null,
        },
        { hasDependencies: async () => true },
      ),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se pueden editar monto, tipo de grupo, vencimiento ni cronograma porque hay inscripciones que congelaron este precio.",
    });
    await expect(
      deletePrice(general.id, { hasDependencies: async () => true }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se puede borrar el precio porque hay inscripciones que congelaron este precio.",
    });
  });

  test("blocks structural price changes and deletion when an inscription froze the price", async () => {
    const event = await createSavedEvent("Regional 2026", { activate: true });
    const { academy, choreography } =
      await createAccountCurrentChoreographyFixture({
        academyName: "Academia Precio Congelado",
        choreographyName: "Coreografía Congelada",
        email: "academia.precio.congelado@example.com",
        event,
      });
    const price = await db.query.prices.findFirst({
      where: eq(prices.eventId, event.id),
    });

    if (!price) {
      throw new Error("Expected seeded price fixture.");
    }

    await freezeInscriptionDepositForTest({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      selectedPriceId: price.id,
    });

    await expect(
      updatePrice(price.id, {
        amount: 12000,
        groupType: "solo",
        paymentDeadline: "2026-05-31",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({
      ok: false,
      error:
        "No se pueden editar monto, tipo de grupo, vencimiento ni cronograma porque hay inscripciones que congelaron este precio.",
    });
    await expect(deletePrice(price.id)).resolves.toMatchObject({
      ok: false,
      error:
        "No se puede borrar el precio porque hay inscripciones que congelaron este precio.",
    });
  });

  test("ignores inscriptions that did not freeze the price when changing it", async () => {
    const event = await createSavedEvent("Regional 2027", { activate: true });
    const { academy, choreography } =
      await createAccountCurrentChoreographyFixture({
        academyName: "Academia Precio Sin Congelar",
        choreographyName: "Coreografía Sin Congelar",
        email: "academia.precio.sin.congelar@example.com",
        event,
      });
    const price = await db.query.prices.findFirst({
      where: eq(prices.eventId, event.id),
    });

    if (!price) {
      throw new Error("Expected seeded price fixture.");
    }

    await freezeInscriptionDepositForTest({
      academyId: academy.academy.id,
      choreographyId: choreography.id,
      selectedPriceId: null,
    });

    await expect(
      updatePrice(price.id, {
        amount: 12000,
        groupType: "solo",
        paymentDeadline: "2026-05-31",
        scheduleId: null,
      }),
    ).resolves.toMatchObject({
      ok: true,
      record: { amount: 12000 },
    });
    await expect(deletePrice(price.id)).resolves.toMatchObject({
      ok: true,
    });
  });
});
