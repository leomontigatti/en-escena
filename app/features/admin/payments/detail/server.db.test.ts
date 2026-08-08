import { and, eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { choreographyDancers, paymentAllocations, payments } from "@/db/schema";
import { registerAcademyEventPayment } from "@/features/admin/finances/academy-choreographies/payments.server";
import {
  createChoreographyRecord,
  createEventCatalog,
  createSelectedPriceInscriptionForTest,
} from "@/features/portal/choreographies/test-support/db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";
import {
  createAcademyUser,
  createSavedEvent,
  createSignedInRequest,
} from "@/lib/admin/finances/finances.test-support";

import { handlePaymentDetailAction } from "./server";
import { deletePaymentIntent, updatePaymentIntent } from "./shared";

installDatabaseTestHooks();

describe.sequential("admin payment detail", () => {
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
      inscriptionId: inscription.id,
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

  test("deletes a payment without requiring an administrative reason", async () => {
    const event = await createSavedEvent();
    const academy = await createAcademyUser({
      email: "academia.pago.eliminar@example.com",
      academyName: "Academia Pago Eliminar",
    });
    await createSignedInRequest({
      email: "admin.pago.eliminar@example.com",
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

    await expect(findPaymentById(payment.id)).resolves.toBeUndefined();
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
      inscriptionId: inscription.id,
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

    // El pago y su asignación quedan eliminados.
    await expect(findPaymentById(payment.id)).resolves.toBeUndefined();
    await expect(findAllocationsByPaymentId(payment.id)).resolves.toEqual([]);

    // La inscripción sobrevive al pago: sólo pierde la plata que tenía encima.
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

    // Pago A: lleva la seña. Pago B: lleva el saldo.
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
        inscriptionId: inscription.id,
        paymentId: depositPayment.id,
      },
      {
        academyId: academy.academy.id,
        amount: 7000,
        eventId: event.id,
        inscriptionId: inscription.id,
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

    // No hay orden de reversión: la plata es fungible y la eliminación procede.
    await expect(
      handlePaymentDetailAction(request, depositPayment.id),
    ).rejects.toMatchObject({ status: 302 });

    await expect(findPaymentById(depositPayment.id)).resolves.toBeUndefined();
    await expect(
      findAllocationsByPaymentId(depositPayment.id),
    ).resolves.toEqual([]);
    // El saldo del otro pago sigue asignado; la inscripción ya no está pagada.
    await expect(
      findAllocationsByPaymentId(balancePayment.id),
    ).resolves.toHaveLength(1);
  });
});

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
  return `http://localhost/administracion/pagos/${paymentId}?evento=${eventId}`;
}
