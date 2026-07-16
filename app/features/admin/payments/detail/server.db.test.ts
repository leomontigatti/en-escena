import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { paymentAllocations, payments } from "@/db/schema";
import { registerAcademyEventPayment } from "@/features/admin/academies/account-current/payments.server";
import {
  createChoreographyRecord,
  createEventCatalog,
  freezeInscriptionDepositForTest,
} from "@/features/portal/choreographies/test-support/db";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";
import {
  createAcademyUser,
  createSavedEvent,
  createSignedInRequest,
} from "@/lib/admin/academies/account-current-route.test-support";

import { handleAdminPaymentDetailAction } from "./server";
import { deleteAdminPaymentIntent, updateAdminPaymentIntent } from "./shared";

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
      intent: updateAdminPaymentIntent,
      paymentId: payment.id,
      requestUrl: paymentDetailUrl(payment.id, event.id),
    });

    await expect(
      handleAdminPaymentDetailAction(request, payment.id),
    ).rejects.toMatchObject({
      status: 302,
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
      allocationType: "deposit",
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
      intent: updateAdminPaymentIntent,
      paymentId: payment.id,
      requestUrl: paymentDetailUrl(payment.id, event.id),
    });

    await expect(
      handleAdminPaymentDetailAction(request, payment.id),
    ).resolves.toMatchObject({
      status: "error",
      intent: updateAdminPaymentIntent,
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
      intent: deleteAdminPaymentIntent,
      paymentId: payment.id,
      requestUrl: paymentDetailUrl(payment.id, event.id),
    });

    await expect(
      handleAdminPaymentDetailAction(request, payment.id),
    ).rejects.toMatchObject({
      status: 302,
    });

    await expect(findPaymentById(payment.id)).resolves.toBeUndefined();
  });

  test("blocks deleting a payment with active allocations", async () => {
    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    const academy = await createAcademyUser({
      email: "academia.pago.eliminar.asignado@example.com",
      academyName: "Academia Pago Eliminar Asignado",
    });
    await createSignedInRequest({
      email: "admin.pago.eliminar.asignado@example.com",
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
      allocationType: "deposit",
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
      intent: deleteAdminPaymentIntent,
      paymentId: payment.id,
      requestUrl: paymentDetailUrl(payment.id, event.id),
    });

    await expect(
      handleAdminPaymentDetailAction(request, payment.id),
    ).resolves.toMatchObject({
      status: "error",
      intent: deleteAdminPaymentIntent,
      fieldErrors: {
        paymentId: "Eliminá primero las asignaciones activas de este pago.",
      },
    });

    await expect(findPaymentById(payment.id)).resolves.toMatchObject({
      id: payment.id,
    });
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

  return await freezeInscriptionDepositForTest({
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

async function findPaymentById(paymentId: string) {
  return await db.query.payments.findFirst({
    where: eq(payments.id, paymentId),
  });
}

function paymentDetailUrl(paymentId: string, eventId: string) {
  return `http://localhost/administracion/pagos/${paymentId}?evento=${eventId}`;
}
