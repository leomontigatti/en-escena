import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies, paymentAllocations, payments } from "@/db/schema";
import {
  createPaymentFieldNames,
  createPaymentSchema,
  readCreatePaymentValues,
  type CreatePaymentFieldName,
  type CreatePaymentFormValues,
} from "@/features/admin/payments/create/shared";
import { loadEventContext } from "@/lib/admin/event-context.server";
import { requireAdminUser } from "@/lib/auth/internal-access.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { getFieldErrors } from "@/lib/shared/form-validation";
import { notificationToasts } from "@/lib/shared/notification-toasts";

import { listPaymentAcademyOptions } from "../academy-options.server";
import { readPaymentDeletionImpact } from "./deletion-impact.server";
import { deletePaymentIntent, updatePaymentIntent } from "./shared";

type DeletePaymentActionData = {
  fieldErrors: Partial<Record<"confirmDeletion" | "paymentId", string>>;
  intent: typeof deletePaymentIntent;
  message: string;
  status: "error";
};

type UpdatePaymentActionData = {
  fieldErrors: Partial<Record<CreatePaymentFieldName | "paymentId", string>>;
  intent: typeof updatePaymentIntent;
  message: string;
  status: "error";
  values: CreatePaymentFormValues;
};

type UpdatePaymentSuccessActionData = {
  intent: typeof updatePaymentIntent;
  message: string;
  status: "success";
};

export type PaymentDetailActionData =
  | DeletePaymentActionData
  | UpdatePaymentActionData
  | UpdatePaymentSuccessActionData;

export async function loadPaymentDetail(request: Request, paymentId: string) {
  const user = await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadEventContext(request);

  const payment = await db
    .select({
      academyId: payments.academyId,
      academyName: academies.name,
      amount: payments.amount,
      eventId: payments.eventId,
      id: payments.id,
      internalNote: payments.internalNote,
      paymentDate: payments.paymentDate,
      paymentMethod: payments.paymentMethod,
      paymentNumber: payments.paymentNumber,
      reference: payments.reference,
    })
    .from(payments)
    .innerJoin(academies, eq(payments.academyId, academies.id))
    .where(eq(payments.id, paymentId))
    .limit(1);

  const paymentDetail = payment[0];

  if (!paymentDetail) {
    throw new Response("No encontramos ese pago.", { status: 404 });
  }

  const [academyOptions, allocatedAmount, affectedChoreographies] =
    await Promise.all([
      listPaymentAcademyOptions(),
      sumPaymentAllocatedAmount(paymentDetail.id),
      readPaymentDeletionImpact({
        academyId: paymentDetail.academyId,
        eventId: paymentDetail.eventId,
        paymentId: paymentDetail.id,
      }),
    ]);

  return {
    academies: academyOptions,
    affectedChoreographies,
    allocatedAmount,
    canDelete: user.role === "admin",
    canEdit: user.role === "admin",
    payment: paymentDetail,
    selectedEventId: eventContext.selectedEventId ?? paymentDetail.eventId,
    values: getPaymentFormValues(paymentDetail),
  };
}

export async function handlePaymentDetailAction(
  request: Request,
  paymentId: string,
): Promise<PaymentDetailActionData | never> {
  await requireAdminUser(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === updatePaymentIntent) {
    return await updatePayment({
      formData,
      paymentId,
    });
  }

  if (intent === deletePaymentIntent) {
    return await deletePayment({
      formData,
      paymentId,
    });
  }

  throw new Response("Acción no soportada.", { status: 400 });
}

async function updatePayment(input: {
  formData: FormData;
  paymentId: string;
}): Promise<UpdatePaymentActionData | UpdatePaymentSuccessActionData | never> {
  const values = readCreatePaymentValues(input.formData);
  const parsed = createPaymentSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      intent: updatePaymentIntent,
      message: "Revisá los datos del pago.",
      fieldErrors: getFieldErrors(parsed.error, createPaymentFieldNames),
      values,
    };
  }

  const [payment, academy] = await Promise.all([
    db.query.payments.findFirst({
      columns: {
        academyId: true,
        eventId: true,
        id: true,
      },
      where: eq(payments.id, input.paymentId),
    }),
    db.query.academies.findFirst({
      columns: { id: true },
      where: eq(academies.id, parsed.data.academyId),
    }),
  ]);

  if (!payment) {
    throw new Response("No encontramos ese pago.", { status: 404 });
  }

  if (!academy) {
    return {
      status: "error",
      intent: updatePaymentIntent,
      message: "Revisá los datos del pago.",
      fieldErrors: {
        academyId: "Seleccioná una academia válida.",
      },
      values,
    };
  }

  const allocatedAmount = await sumPaymentAllocatedAmount(payment.id);
  const accountingFieldErrors = getPaymentEditAccountingFieldErrors({
    allocatedAmount,
    currentAcademyId: payment.academyId,
    nextAcademyId: parsed.data.academyId,
    nextAmount: Number(parsed.data.amount),
  });

  if (Object.keys(accountingFieldErrors).length > 0) {
    return {
      status: "error",
      intent: updatePaymentIntent,
      message: "Revisá los datos del pago.",
      fieldErrors: accountingFieldErrors,
      values,
    };
  }

  await db
    .update(payments)
    .set({
      academyId: parsed.data.academyId,
      amount: Number(parsed.data.amount),
      internalNote: parsed.data.internalNote || null,
      paymentDate: parsed.data.paymentDate,
      paymentMethod: parsed.data.paymentMethod,
      reference: parsed.data.reference || null,
      updatedAt: new Date(),
    })
    .where(eq(payments.id, payment.id));

  return {
    status: "success",
    intent: updatePaymentIntent,
    message: notificationToasts["pago-guardado"].message,
  };
}

async function deletePayment(input: {
  formData: FormData;
  paymentId: string;
}): Promise<DeletePaymentActionData | never> {
  if (
    String(input.formData.get("id") ?? "").trim() !== input.paymentId ||
    String(input.formData.get("confirmDeletion") ?? "").trim() !==
      input.paymentId
  ) {
    return {
      status: "error",
      intent: deletePaymentIntent,
      message: "Confirmá la eliminación del pago.",
      fieldErrors: {
        confirmDeletion: "Confirmá la eliminación del pago.",
      },
    };
  }

  const payment = await db.query.payments.findFirst({
    columns: {
      eventId: true,
    },
    where: eq(payments.id, input.paymentId),
  });

  if (!payment) {
    throw new Response("No encontramos ese pago.", { status: 404 });
  }

  // Its allocations fall with the foreign key cascade — the database is what
  // cascades, not this module — and nothing else has to be reconciled: every
  // figure an inscription shows is derived from what is allocated to it right
  // now. There is no blocking case: the deletion always proceeds.
  await db.delete(payments).where(eq(payments.id, input.paymentId));

  throw redirect(`/administracion/pagos?evento=${payment.eventId}`);
}

function getPaymentFormValues(payment: {
  academyId: string;
  amount: number;
  internalNote: string | null;
  paymentDate: string;
  paymentMethod: CreatePaymentFormValues["paymentMethod"];
  reference: string | null;
}): CreatePaymentFormValues {
  return {
    academyId: payment.academyId,
    amount: String(payment.amount),
    internalNote: payment.internalNote ?? "",
    paymentDate: payment.paymentDate,
    paymentMethod: payment.paymentMethod,
    reference: payment.reference ?? "",
  };
}

async function sumPaymentAllocatedAmount(paymentId: string) {
  const rows = await db
    .select({ amount: paymentAllocations.amount })
    .from(paymentAllocations)
    .where(eq(paymentAllocations.paymentId, paymentId));

  return rows.reduce((total, allocation) => total + allocation.amount, 0);
}

function getPaymentEditAccountingFieldErrors(input: {
  allocatedAmount: number;
  currentAcademyId: string;
  nextAcademyId: string;
  nextAmount: number;
}): Partial<Record<CreatePaymentFieldName, string>> {
  const fieldErrors: Partial<Record<CreatePaymentFieldName, string>> = {};

  if (
    input.allocatedAmount > 0 &&
    input.nextAcademyId !== input.currentAcademyId
  ) {
    fieldErrors.academyId =
      "No se puede cambiar la academia de un pago con asignaciones activas.";
  }

  if (input.nextAmount < input.allocatedAmount) {
    fieldErrors.amount = "El monto no puede ser menor al total ya asignado.";
  }

  return fieldErrors;
}
