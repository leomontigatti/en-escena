import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import {
  academyEventInvoiceImputations,
  academyEventPayments,
} from "@/db/schema";
import { registerAcademyEventPayment } from "@/features/admin/academies/account-current/payments.server";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";
import {
  accountCurrentUrl,
  createAccountCurrentInvoicePaymentFixture,
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
    const { userId: adminUserId } = await createSignedInRequest({
      email: "admin.pago.edicion@example.com",
      role: "admin",
      requestUrl: paymentDetailUrl("payment_pending", event.id),
    });

    await registerAcademyEventPayment({
      academyId: academy.academy.id,
      amount: 5000,
      createdByUserId: adminUserId,
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
      annulledAt: null,
      annulledReason: null,
      internalNote: "Pago corregido",
      paymentDate: "2026-03-16",
      paymentMethod: "efectivo",
      paymentNumber: 1,
      reference: "REC-002",
    });
  });

  test("blocks edits that would invalidate active imputations", async () => {
    const event = await createSavedEvent({
      requiredDepositPercentage: 30,
    });
    const { academy, invoice, payment } =
      await createAccountCurrentInvoicePaymentFixture({
        event,
        email: "academia.pago.imputado@example.com",
        academyName: "Academia Pago Imputado",
        choreographyName: "Pago imputado",
      });
    const nextAcademy = await createAcademyUser({
      email: "academia.pago.imputado.nueva@example.com",
      academyName: "Academia Pago Imputado Nueva",
    });
    const { userId: adminUserId } = await createSignedInRequest({
      email: "admin.pago.imputado@example.com",
      role: "admin",
      requestUrl: accountCurrentUrl(academy.academy.id, event.id),
    });

    await db.insert(academyEventInvoiceImputations).values({
      academyId: academy.academy.id,
      amount: invoice.depositAmount,
      createdByUserId: adminUserId,
      eventId: event.id,
      imputationDate: "2026-03-21",
      invoiceId: invoice.id,
      paymentId: payment.id,
    });

    const request = await buildPaymentDetailPostRequest({
      fields: {
        academyId: nextAcademy.academy.id,
        amount: String(invoice.depositAmount - 1),
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
          "No se puede cambiar la academia de un pago con imputaciones activas.",
        amount: "El monto no puede ser menor al total ya imputado.",
        paymentDate:
          "La fecha de pago no puede ser posterior a una imputación activa.",
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
    const { userId: adminUserId } = await createSignedInRequest({
      email: "admin.pago.eliminar@example.com",
      role: "admin",
      requestUrl: paymentDetailUrl("payment_pending", event.id),
    });

    await registerAcademyEventPayment({
      academyId: academy.academy.id,
      amount: 4000,
      createdByUserId: adminUserId,
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

    await expect(findPaymentById(payment.id)).resolves.toMatchObject({
      annulledAt: expect.any(Date),
      annulledByUserId: expect.any(String),
      annulledReason: null,
    });
  });
});

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
  const payment = await db.query.academyEventPayments.findFirst({
    where: eq(academyEventPayments.academyId, academyId),
  });

  if (!payment) {
    throw new Error("Expected payment fixture.");
  }

  return payment;
}

async function findPaymentById(paymentId: string) {
  return await db.query.academyEventPayments.findFirst({
    where: eq(academyEventPayments.id, paymentId),
  });
}

function paymentDetailUrl(paymentId: string, eventId: string) {
  return `http://localhost/administracion/pagos/${paymentId}?evento=${eventId}`;
}
