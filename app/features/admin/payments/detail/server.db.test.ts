import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  choreographyDancers,
  paymentAllocations,
  payments,
  refunds,
} from "@/db/schema";
import { registerAcademyEventPayment } from "@/features/admin/finances/academy-choreographies/payments.server";
import { registerRefundForTest } from "@/lib/admin/finances/finances.test-support";
import {
  createChoreographyRecord,
  createEventCatalog,
  createSelectedPriceInscriptionForTest,
} from "@/features/portal/choreographies/test-support/db";
import { seedSeminarPresetFixture } from "@/lib/admin/finances/seminar-finances.test-support";
import {
  lockAcademyPools,
  spreadFromPool,
} from "@/lib/finances/allocation-pool.server";
import { createSignedInRequest } from "@/lib/test-support/auth";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSavedEvent } from "@/lib/test-support/events";

import {
  installDatabaseTestHooks,
  isPgliteTestBackend,
} from "../../../../../tests/db/harness";
import { runBehindAHolder } from "../../../../../tests/db/lock-contention";

import { handlePaymentDetailAction, loadPaymentDetail } from "./server";
import { deletePaymentIntent, updatePaymentIntent } from "./shared";

installDatabaseTestHooks();

describe("admin payment detail", () => {
  test("updates an existing payment", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "academia.pago.edicion@example.com",
      academyName: "Academia Pago Edición",
    });
    const nextAcademy = await createAcademyUser({
      email: "academia.pago.edicion.nueva@example.com",
      academyName: "Academia Pago Nueva",
    });
    await createSignedInRequest({
      email: "admin.pago.edicion@example.com",
      role: "admin",
      requestUrl: paymentDetailUrl("payment_pending", event.id),
    });

    await registerAcademyEventPayment({
      academyId: academy.academy.id,
      amount: 5000,
      eventId: event.id,
      internalNote: "Carga inicial",
      paymentDate: "2026-03-15",
      paymentMethod: "transferencia",
      reference: "TRX-001",
    });

    const payment = await findPaymentByAcademyId(academy.academy.id);
    const request = await buildPaymentDetailPostRequest({
      fields: {
        academyId: nextAcademy.academy.id,
        amount: "7500",
        internalNote: "Pago corregido",
        paymentDate: "2026-03-16",
        paymentMethod: "efectivo",
        reference: "REC-002",
      },
      intent: updatePaymentIntent,
      paymentId: payment.id,
      requestUrl: paymentDetailUrl(payment.id, event.id),
    });

    await expect(
      handlePaymentDetailAction(request, payment.id),
    ).resolves.toMatchObject({
      status: "success",
      intent: updatePaymentIntent,
      message: "Pago guardado.",
    });

    await expect(findPaymentById(payment.id)).resolves.toMatchObject({
      academyId: nextAcademy.academy.id,
      amount: 7500,
      internalNote: "Pago corregido",
      paymentDate: "2026-03-16",
      paymentMethod: "efectivo",
      paymentNumber: 1,
      reference: "REC-002",
    });
  });

  test("blocks edits that would invalidate active allocations", async () => {
    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    const academy = await createAcademyUser({
      email: "academia.pago.asignado@example.com",
      academyName: "Academia Pago Asignado",
    });
    const nextAcademy = await createAcademyUser({
      email: "academia.pago.asignado.nueva@example.com",
      academyName: "Academia Pago Asignado Nueva",
    });
    await createSignedInRequest({
      email: "admin.pago.asignado@example.com",
      role: "admin",
      requestUrl: paymentDetailUrl("payment_pending", event.id),
    });

    await registerAcademyEventPayment({
      academyId: academy.academy.id,
      amount: 5000,
      eventId: event.id,
      internalNote: "Carga inicial",
      paymentDate: "2026-03-15",
      paymentMethod: "transferencia",
      reference: "TRX-001",
    });

    const payment = await findPaymentByAcademyId(academy.academy.id);
    const inscription = await createFrozenInscription({
      academyId: academy.academy.id,
      eventId: event.id,
    });

    const allocatedAmount = 3000;
    await db.insert(paymentAllocations).values({
      academyId: academy.academy.id,
      amount: allocatedAmount,
      eventId: event.id,
      choreographyInscriptionId: inscription.id,
      paymentId: payment.id,
    });

    const request = await buildPaymentDetailPostRequest({
      fields: {
        academyId: nextAcademy.academy.id,
        amount: String(allocatedAmount - 1),
        internalNote: payment.internalNote ?? "",
        paymentDate: "2026-03-22",
        paymentMethod: payment.paymentMethod,
        reference: payment.reference ?? "",
      },
      intent: updatePaymentIntent,
      paymentId: payment.id,
      requestUrl: paymentDetailUrl(payment.id, event.id),
    });

    await expect(
      handlePaymentDetailAction(request, payment.id),
    ).resolves.toMatchObject({
      status: "error",
      intent: updatePaymentIntent,
      fieldErrors: {
        academyId:
          "No se puede cambiar la academia de un pago con asignaciones activas.",
        amount: "El monto no puede ser menor al total ya asignado.",
      },
    });

    await expect(findPaymentById(payment.id)).resolves.toMatchObject({
      academyId: academy.academy.id,
      amount: payment.amount,
      paymentDate: payment.paymentDate,
    });
  });

  test("cascades allocation removal when deleting a payment", async () => {
    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    const academy = await createAcademyUser({
      email: "academia.pago.eliminar.cascada@example.com",
      academyName: "Academia Pago Eliminar Cascada",
    });
    await createSignedInRequest({
      email: "admin.pago.eliminar.cascada@example.com",
      role: "admin",
      requestUrl: paymentDetailUrl("payment_pending", event.id),
    });

    await registerAcademyEventPayment({
      academyId: academy.academy.id,
      amount: 4000,
      eventId: event.id,
      internalNote: null,
      paymentDate: "2026-03-15",
      paymentMethod: "transferencia",
      reference: null,
    });

    const payment = await findPaymentByAcademyId(academy.academy.id);
    const inscription = await createFrozenInscription({
      academyId: academy.academy.id,
      eventId: event.id,
    });

    await db.insert(paymentAllocations).values({
      academyId: academy.academy.id,
      amount: 3000,
      eventId: event.id,
      choreographyInscriptionId: inscription.id,
      paymentId: payment.id,
    });

    const request = await buildPaymentDetailPostRequest({
      fields: {
        confirmDeletion: payment.id,
        id: payment.id,
      },
      intent: deletePaymentIntent,
      paymentId: payment.id,
      requestUrl: paymentDetailUrl(payment.id, event.id),
    });

    await expect(
      handlePaymentDetailAction(request, payment.id),
    ).rejects.toMatchObject({
      status: 302,
    });

    // The payment and its allocation are deleted.
    await expect(findPaymentById(payment.id)).resolves.toBeUndefined();
    await expect(findAllocationsByPaymentId(payment.id)).resolves.toEqual([]);

    // The inscription outlives the payment: it only loses the money on it.
    await expect(findInscriptionById(inscription.id)).resolves.toBeDefined();
  });

  test("deletes the payment even when the balance lives in another payment", async () => {
    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    const academy = await createAcademyUser({
      email: "academia.pago.eliminar.saldo@example.com",
      academyName: "Academia Pago Eliminar Saldo",
    });
    await createSignedInRequest({
      email: "admin.pago.eliminar.saldo@example.com",
      role: "admin",
      requestUrl: paymentDetailUrl("payment_pending", event.id),
    });

    // Payment A: carries the deposit. Payment B: carries the balance.
    await registerAcademyEventPayment({
      academyId: academy.academy.id,
      amount: 3000,
      eventId: event.id,
      internalNote: null,
      paymentDate: "2026-03-15",
      paymentMethod: "transferencia",
      reference: "SEÑA",
    });
    await registerAcademyEventPayment({
      academyId: academy.academy.id,
      amount: 7000,
      eventId: event.id,
      internalNote: null,
      paymentDate: "2026-03-20",
      paymentMethod: "transferencia",
      reference: "SALDO",
    });

    const depositPayment = await findPaymentByReference(
      academy.academy.id,
      "SEÑA",
    );
    const balancePayment = await findPaymentByReference(
      academy.academy.id,
      "SALDO",
    );

    const inscription = await createFrozenInscription({
      academyId: academy.academy.id,
      eventId: event.id,
    });

    await db.insert(paymentAllocations).values([
      {
        academyId: academy.academy.id,
        amount: 3000,
        eventId: event.id,
        choreographyInscriptionId: inscription.id,
        paymentId: depositPayment.id,
      },
      {
        academyId: academy.academy.id,
        amount: 7000,
        eventId: event.id,
        choreographyInscriptionId: inscription.id,
        paymentId: balancePayment.id,
      },
    ]);

    const request = await buildPaymentDetailPostRequest({
      fields: {
        confirmDeletion: depositPayment.id,
        id: depositPayment.id,
      },
      intent: deletePaymentIntent,
      paymentId: depositPayment.id,
      requestUrl: paymentDetailUrl(depositPayment.id, event.id),
    });

    // There is no reversal order: money is fungible and the deletion proceeds.
    await expect(
      handlePaymentDetailAction(request, depositPayment.id),
    ).rejects.toMatchObject({ status: 302 });

    await expect(findPaymentById(depositPayment.id)).resolves.toBeUndefined();
    await expect(
      findAllocationsByPaymentId(depositPayment.id),
    ).resolves.toEqual([]);
    // The other payment's balance is still allocated; the inscription is no longer
    // paid.
    await expect(
      findAllocationsByPaymentId(balancePayment.id),
    ).resolves.toHaveLength(1);
  });
});

/**
 * Refunds draw on the owner's pool, never on one payment, so a payment that
 * leaves or shrinks can take with it money a refund already handed back. The
 * pool floor refuses that, and nothing else.
 */
describe("a payment edit or deletion against the owner's refunds", () => {
  const refusedMessage =
    "Los reembolsos superarían el saldo disponible. Editá o eliminá un reembolso primero.";

  // Two payments of 3000 and 2000, 1000 allocated, 2500 refunded: 1500 left.
  async function seedRefundedPool() {
    const event = await createSavedEvent({ requiredDepositPercentage: 30 });
    const academy = await createAcademyUser({
      email: `${crypto.randomUUID()}@example.com`,
      academyName: "Academia Reembolsada",
    });
    const otherAcademy = await createAcademyUser({
      email: `${crypto.randomUUID()}@example.com`,
      academyName: "Academia Destino",
    });

    for (const [amount, reference] of [
      [3000, "PRIMERO"],
      [2000, "SEGUNDO"],
    ] as const) {
      await registerAcademyEventPayment({
        academyId: academy.academy.id,
        amount,
        eventId: event.id,
        internalNote: null,
        paymentDate: "2026-03-15",
        paymentMethod: "transferencia",
        reference,
      });
    }

    const first = await findPaymentByReference(academy.academy.id, "PRIMERO");
    const second = await findPaymentByReference(academy.academy.id, "SEGUNDO");
    const inscription = await createFrozenInscription({
      academyId: academy.academy.id,
      eventId: event.id,
    });

    await db.insert(paymentAllocations).values({
      academyId: academy.academy.id,
      amount: 1000,
      choreographyInscriptionId: inscription.id,
      eventId: event.id,
      paymentId: first.id,
    });
    await registerRefundForTest({
      academyId: academy.academy.id,
      amount: 2500,
      eventId: event.id,
    });

    return { academy, event, first, otherAcademy, second };
  }

  function editRequest(
    seeded: Awaited<ReturnType<typeof seedRefundedPool>>,
    payment: Awaited<ReturnType<typeof findPaymentById>> & {},
    fields: { academyId?: string; amount?: number },
  ) {
    return buildPaymentDetailPostRequest({
      fields: {
        academyId: fields.academyId ?? payment.academyId,
        amount: String(fields.amount ?? payment.amount),
        internalNote: "",
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        reference: payment.reference ?? "",
      },
      intent: updatePaymentIntent,
      paymentId: payment.id,
      requestUrl: paymentDetailUrl(payment.id, seeded.event.id),
    });
  }

  function deleteRequest(
    seeded: Awaited<ReturnType<typeof seedRefundedPool>>,
    paymentId: string,
  ) {
    return buildPaymentDetailPostRequest({
      fields: { confirmDeletion: paymentId, id: paymentId },
      intent: deletePaymentIntent,
      paymentId,
      requestUrl: paymentDetailUrl(paymentId, seeded.event.id),
    });
  }

  test("refuses a deletion that would leave the refunds uncovered, and keeps the payment", async () => {
    const seeded = await seedRefundedPool();

    // Without the 2000 payment: 3000 − 1000 allocated = 2000 < 2500 refunded.
    await expect(
      handlePaymentDetailAction(
        await deleteRequest(seeded, seeded.second.id),
        seeded.second.id,
      ),
    ).resolves.toEqual({
      fieldErrors: {},
      intent: deletePaymentIntent,
      message: `No se puede eliminar el pago. ${refusedMessage}`,
      status: "error",
    });
    await expect(findPaymentById(seeded.second.id)).resolves.toBeDefined();
  });

  test("deletes the payment when the rest of the pool still covers the refunds", async () => {
    const seeded = await seedRefundedPool();

    await registerAcademyEventPayment({
      academyId: seeded.academy.academy.id,
      amount: 1000,
      eventId: seeded.event.id,
      internalNote: null,
      paymentDate: "2026-03-20",
      paymentMethod: "efectivo",
      reference: null,
    });

    // 3000 + 1000 − 1000 allocated = 3000 ≥ 2500 refunded.
    await expect(
      handlePaymentDetailAction(
        await deleteRequest(seeded, seeded.second.id),
        seeded.second.id,
      ),
    ).rejects.toMatchObject({ status: 302 });
    await expect(findPaymentById(seeded.second.id)).resolves.toBeUndefined();
  });

  test("refuses an amount cut below the refunds and saves one down to them", async () => {
    const seeded = await seedRefundedPool();

    await expect(
      handlePaymentDetailAction(
        await editRequest(seeded, seeded.second, { amount: 499 }),
        seeded.second.id,
      ),
    ).resolves.toMatchObject({
      fieldErrors: { amount: refusedMessage },
      status: "error",
    });
    await expect(findPaymentById(seeded.second.id)).resolves.toMatchObject({
      amount: 2000,
    });

    await expect(
      handlePaymentDetailAction(
        await editRequest(seeded, seeded.second, { amount: 500 }),
        seeded.second.id,
      ),
    ).resolves.toMatchObject({ status: "success" });
    await expect(findPaymentById(seeded.second.id)).resolves.toMatchObject({
      amount: 500,
    });
  });

  test("refuses moving the payment to another owner when the refunds would be uncovered", async () => {
    const seeded = await seedRefundedPool();

    await expect(
      handlePaymentDetailAction(
        await editRequest(seeded, seeded.second, {
          academyId: seeded.otherAcademy.academy.id,
        }),
        seeded.second.id,
      ),
    ).resolves.toMatchObject({
      fieldErrors: { academyId: refusedMessage },
      status: "error",
    });
    await expect(findPaymentById(seeded.second.id)).resolves.toMatchObject({
      academyId: seeded.academy.academy.id,
    });
  });

  test("keeps the allocation guards ahead of the pool floor", async () => {
    const seeded = await seedRefundedPool();

    await expect(
      handlePaymentDetailAction(
        await editRequest(seeded, seeded.first, {
          academyId: seeded.otherAcademy.academy.id,
          amount: 999,
        }),
        seeded.first.id,
      ),
    ).resolves.toMatchObject({
      fieldErrors: {
        academyId:
          "No se puede cambiar la academia de un pago con asignaciones activas.",
        amount: "El monto no puede ser menor al total ya asignado.",
      },
      status: "error",
    });
  });

  test("the detail tells the deletion dialog when the refunds block it", async () => {
    const seeded = await seedRefundedPool();
    const load = async (paymentId: string) =>
      await loadPaymentDetail(
        (
          await createSignedInRequest({
            email: `${crypto.randomUUID()}@example.com`,
            role: "admin",
            requestUrl: paymentDetailUrl(paymentId, seeded.event.id),
          })
        ).request,
        paymentId,
      );

    await expect(load(seeded.second.id)).resolves.toMatchObject({
      deletionUncoversRefunds: true,
    });

    await db.delete(refunds).where(eq(refunds.eventId, seeded.event.id));

    await expect(load(seeded.second.id)).resolves.toMatchObject({
      deletionUncoversRefunds: false,
    });
  });
});

/**
 * The edit checks the payment still covers what is allocated to it while a
 * spread is allocating to it. Only the academy's pool lock orders the two; one
 * PGlite connection would order them on its own, so this runs on Postgres only.
 */
describe.skipIf(isPgliteTestBackend())(
  "a payment edit under real contention",
  () => {
    test("an edit that waits on a spread reads what the spread allocated, and refuses to go below it", async () => {
      const fixture = await seedSeminarPresetFixture({ paymentAmount: 30000 });
      const payment = await findPaymentByAcademyId(fixture.academyId);
      const request = await buildPaymentDetailPostRequest({
        fields: {
          academyId: fixture.academyId,
          amount: "10000",
          internalNote: "",
          // The fixture dates its payment in 2030; an edit refuses a future date.
          paymentDate: "2026-03-15",
          paymentMethod: payment.paymentMethod,
          reference: "",
        },
        intent: updatePaymentIntent,
        paymentId: payment.id,
        requestUrl: paymentDetailUrl(payment.id, fixture.eventId),
      });

      const result = await runBehindAHolder({
        waitingOn: "academy pool lock",
        hold: async (tx) =>
          expect(
            await spreadFromPool(tx, {
              academyId: fixture.academyId,
              amount: 20000,
              eventId: fixture.eventId,
              target: {
                id: fixture.inscriptions.specialParticipant.id,
                kind: "seminar",
              },
            }),
          ).toEqual({ ok: true }),
        contender: () => handlePaymentDetailAction(request, payment.id),
      });

      expect(result).toMatchObject({
        status: "error",
        fieldErrors: {
          amount: "El monto no puede ser menor al total ya asignado.",
        },
      });
      await expect(findPaymentById(payment.id)).resolves.toMatchObject({
        amount: 30000,
      });
    });

    /**
     * Locking the pool the payment moved to while still holding the one it was
     * read in takes two pool locks in move order, which deadlocks against a
     * merge that takes them sorted. So a payment that moved while the edit
     * waited is refused instead.
     */
    test("refuses an edit whose payment moved academy while it waited on the pool lock", async () => {
      const moved = await seedPaymentMovedBehindAHolder();
      const request = await buildPaymentDetailPostRequest({
        fields: {
          academyId: moved.academyId,
          amount: "6000",
          internalNote: "",
          paymentDate: "2026-03-15",
          paymentMethod: "transferencia",
          reference: "",
        },
        intent: updatePaymentIntent,
        paymentId: moved.paymentId,
        requestUrl: paymentDetailUrl(moved.paymentId, moved.eventId),
      });

      const result = await moved.runContender(() =>
        handlePaymentDetailAction(request, moved.paymentId),
      );

      expect(result).toMatchObject({
        status: "error",
        intent: updatePaymentIntent,
        message: "El pago cambió mientras se guardaba. Volvé a intentarlo.",
      });
      await expect(findPaymentById(moved.paymentId)).resolves.toMatchObject({
        academyId: moved.nextAcademyId,
        amount: 5000,
      });
    });

    test("refuses a deletion whose payment moved academy while it waited on the pool lock", async () => {
      const moved = await seedPaymentMovedBehindAHolder();
      const request = await buildPaymentDetailPostRequest({
        fields: { confirmDeletion: moved.paymentId, id: moved.paymentId },
        intent: deletePaymentIntent,
        paymentId: moved.paymentId,
        requestUrl: paymentDetailUrl(moved.paymentId, moved.eventId),
      });

      const result = await moved.runContender(() =>
        handlePaymentDetailAction(request, moved.paymentId),
      );

      expect(result).toMatchObject({
        status: "error",
        intent: deletePaymentIntent,
        message: "El pago cambió mientras se guardaba. Volvé a intentarlo.",
      });
      await expect(findPaymentById(moved.paymentId)).resolves.toMatchObject({
        academyId: moved.nextAcademyId,
      });
    });
  },
);

/**
 * A payment of one academy, and a way to run a contender behind a transaction
 * that holds that academy's pool lock and moves the payment to another academy
 * before committing.
 */
async function seedPaymentMovedBehindAHolder() {
  const event = await createSavedEvent();
  const academy = await createAcademyUser({
    email: `${crypto.randomUUID()}@example.com`,
    academyName: "Academia Pago Origen",
  });
  const nextAcademy = await createAcademyUser({
    email: `${crypto.randomUUID()}@example.com`,
    academyName: "Academia Pago Destino",
  });

  await registerAcademyEventPayment({
    academyId: academy.academy.id,
    amount: 5000,
    eventId: event.id,
    internalNote: "",
    paymentDate: "2026-03-15",
    paymentMethod: "transferencia",
    reference: "",
  });

  const payment = await findPaymentByAcademyId(academy.academy.id);

  return {
    academyId: academy.academy.id,
    eventId: event.id,
    nextAcademyId: nextAcademy.academy.id,
    paymentId: payment.id,
    runContender: <T>(contender: () => Promise<T>) =>
      runBehindAHolder({
        waitingOn: "academy pool lock",
        hold: async (tx) => {
          await lockAcademyPools(tx, [
            { academyId: academy.academy.id, eventId: event.id },
          ]);
          await tx
            .update(payments)
            .set({ academyId: nextAcademy.academy.id })
            .where(eq(payments.id, payment.id));
        },
        contender,
      }),
  };
}

async function createFrozenInscription(input: {
  academyId: string;
  eventId: string;
}) {
  const catalog = await createEventCatalog(input.eventId);
  const choreography = await createChoreographyRecord({
    academyId: input.academyId,
    categoryId: catalog.categoryWithLevel.id,
    eventId: input.eventId,
    experienceLevelId: catalog.level.id,
    modalityId: catalog.modality.id,
    name: "Coreografía Asignada",
    scheduleCapacityId: catalog.scheduleCapacity.id,
    submodalityId: catalog.submodality.id,
  });

  return await createSelectedPriceInscriptionForTest({
    academyId: input.academyId,
    choreographyId: choreography.id,
  });
}

async function buildPaymentDetailPostRequest(input: {
  fields: Record<string, string>;
  intent: string;
  paymentId: string;
  requestUrl: string;
}) {
  const signedIn = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role: "admin",
    requestUrl: input.requestUrl,
  });
  const formData = new FormData();

  formData.set("intent", input.intent);

  for (const [fieldName, value] of Object.entries(input.fields)) {
    formData.set(fieldName, value);
  }

  return new Request(input.requestUrl, {
    method: "POST",
    body: formData,
    headers: {
      cookie: signedIn.request.headers.get("cookie") ?? "",
    },
  });
}

async function findPaymentByAcademyId(academyId: string) {
  const payment = await db.query.payments.findFirst({
    where: eq(payments.academyId, academyId),
  });

  if (!payment) {
    throw new Error("Expected payment fixture.");
  }

  return payment;
}

async function findPaymentByReference(academyId: string, reference: string) {
  const payment = await db.query.payments.findFirst({
    where: and(
      eq(payments.academyId, academyId),
      eq(payments.reference, reference),
    ),
  });

  if (!payment) {
    throw new Error(`Expected payment fixture with reference ${reference}.`);
  }

  return payment;
}

async function findPaymentById(paymentId: string) {
  return await db.query.payments.findFirst({
    where: eq(payments.id, paymentId),
  });
}

async function findAllocationsByPaymentId(paymentId: string) {
  return await db.query.paymentAllocations.findMany({
    where: eq(paymentAllocations.paymentId, paymentId),
  });
}

async function findInscriptionById(inscriptionId: string) {
  return await db.query.choreographyDancers.findFirst({
    where: eq(choreographyDancers.id, inscriptionId),
  });
}

function paymentDetailUrl(paymentId: string, eventId: string) {
  return `http://localhost/administracion/movimientos/pagos/${paymentId}?evento=${eventId}`;
}
