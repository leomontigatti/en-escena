import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import {
  academies,
  academyEventInvoiceImputations,
  academyEventPayments,
} from "@/db/schema";
import {
  createPaymentFieldNames,
  createPaymentSchema,
  readCreatePaymentValues,
  type CreatePaymentFieldName,
  type CreatePaymentFormValues,
} from "@/features/admin/payments/create/shared";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireAdminUser } from "@/lib/auth/internal-access.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";
import { deletePaymentWithoutReason } from "@/lib/finances/account-current-corrections.server";
import { getFieldErrors } from "@/lib/shared/form-validation";

import { listAdminPaymentAcademyOptions } from "../academy-options.server";
import { deleteAdminPaymentIntent, updateAdminPaymentIntent } from "./shared";

type DeletePaymentActionData = {
  fieldErrors: Partial<Record<"confirmDeletion" | "paymentId", string>>;
  intent: typeof deleteAdminPaymentIntent;
  message: string;
  status: "error";
};

type UpdatePaymentActionData = {
  fieldErrors: Partial<Record<CreatePaymentFieldName | "paymentId", string>>;
  intent: typeof updateAdminPaymentIntent;
  message: string;
  status: "error";
  values: CreatePaymentFormValues;
};

export type AdminPaymentDetailActionData =
  | DeletePaymentActionData
  | UpdatePaymentActionData;

export async function loadAdminPaymentDetail(
  request: Request,
  paymentId: string,
) {
  const user = await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);

  const payment = await db
    .select({
      academyId: academyEventPayments.academyId,
      academyName: academies.name,
      amount: academyEventPayments.amount,
      annulledAt: academyEventPayments.annulledAt,
      annulledReason: academyEventPayments.annulledReason,
      eventId: academyEventPayments.eventId,
      id: academyEventPayments.id,
      internalNote: academyEventPayments.internalNote,
      paymentDate: academyEventPayments.paymentDate,
      paymentMethod: academyEventPayments.paymentMethod,
      paymentNumber: academyEventPayments.paymentNumber,
      reference: academyEventPayments.reference,
    })
    .from(academyEventPayments)
    .innerJoin(academies, eq(academyEventPayments.academyId, academies.id))
    .where(eq(academyEventPayments.id, paymentId))
    .limit(1);

  const paymentDetail = payment[0];

  if (!paymentDetail) {
    throw new Response("No encontramos ese pago.", { status: 404 });
  }

  const [academyOptions, activeImputations] = await Promise.all([
    listAdminPaymentAcademyOptions(),
    listActivePaymentImputations(paymentDetail.id),
  ]);
  const activeImputedAmount = sumActiveImputedAmount(activeImputations);

  return {
    academies: academyOptions,
    activeImputedAmount,
    canDelete: user.role === "admin",
    canEdit: user.role === "admin",
    payment: paymentDetail,
    selectedEventId: eventContext.selectedEventId ?? paymentDetail.eventId,
    values: getPaymentFormValues(paymentDetail),
  };
}

export async function handleAdminPaymentDetailAction(
  request: Request,
  paymentId: string,
): Promise<AdminPaymentDetailActionData | never> {
  const adminUser = await requireAdminUser(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === updateAdminPaymentIntent) {
    return await updateAdminPayment({
      formData,
      paymentId,
      requestUrl: request.url,
    });
  }

  if (intent === deleteAdminPaymentIntent) {
    return await deleteAdminPayment({
      adminUserId: adminUser.id,
      formData,
      paymentId,
    });
  }

  throw new Response("Acción no soportada.", { status: 400 });
}

async function updateAdminPayment(input: {
  formData: FormData;
  paymentId: string;
  requestUrl: string;
}): Promise<UpdatePaymentActionData | never> {
  const values = readCreatePaymentValues(input.formData);
  const parsed = createPaymentSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      intent: updateAdminPaymentIntent,
      message: "Revisá los datos del pago.",
      fieldErrors: getFieldErrors(parsed.error, createPaymentFieldNames),
      values,
    };
  }

  const [payment, academy] = await Promise.all([
    db.query.academyEventPayments.findFirst({
      columns: {
        academyId: true,
        annulledAt: true,
        eventId: true,
        id: true,
      },
      where: eq(academyEventPayments.id, input.paymentId),
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
      intent: updateAdminPaymentIntent,
      message: "Revisá los datos del pago.",
      fieldErrors: {
        academyId: "Seleccioná una academia válida.",
      },
      values,
    };
  }

  if (payment.annulledAt) {
    return {
      status: "error",
      intent: updateAdminPaymentIntent,
      message: "No se puede editar un pago eliminado.",
      fieldErrors: {
        paymentId: "No se puede editar un pago eliminado.",
      },
      values,
    };
  }

  const activeImputations = await listActivePaymentImputations(payment.id);
  const accountingFieldErrors = getPaymentEditAccountingFieldErrors({
    activeImputations,
    currentAcademyId: payment.academyId,
    nextAcademyId: parsed.data.academyId,
    nextAmount: Number(parsed.data.amount),
    nextPaymentDate: parsed.data.paymentDate,
  });

  if (Object.keys(accountingFieldErrors).length > 0) {
    return {
      status: "error",
      intent: updateAdminPaymentIntent,
      message: "Revisá los datos del pago.",
      fieldErrors: accountingFieldErrors,
      values,
    };
  }

  await db
    .update(academyEventPayments)
    .set({
      academyId: parsed.data.academyId,
      amount: Number(parsed.data.amount),
      internalNote: parsed.data.internalNote || null,
      paymentDate: parsed.data.paymentDate,
      paymentMethod: parsed.data.paymentMethod,
      reference: parsed.data.reference || null,
      updatedAt: new Date(),
    })
    .where(eq(academyEventPayments.id, payment.id));

  throw redirect(input.requestUrl);
}

async function deleteAdminPayment(input: {
  adminUserId: string;
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
      intent: deleteAdminPaymentIntent,
      message: "Confirmá la eliminación del pago.",
      fieldErrors: {
        confirmDeletion: "Confirmá la eliminación del pago.",
      },
    };
  }

  const payment = await db.query.academyEventPayments.findFirst({
    columns: {
      academyId: true,
      eventId: true,
    },
    where: eq(academyEventPayments.id, input.paymentId),
  });

  if (!payment) {
    throw new Response("No encontramos ese pago.", { status: 404 });
  }

  const result = await deletePaymentWithoutReason({
    academyId: payment.academyId,
    deletedByUserId: input.adminUserId,
    eventId: payment.eventId,
    paymentId: input.paymentId,
  });

  if (!result.ok) {
    return {
      status: "error",
      intent: deleteAdminPaymentIntent,
      message: "No se puede eliminar el pago.",
      fieldErrors: {
        paymentId:
          result.fieldErrors.paymentId ===
          "Anulá primero las imputaciones activas de este Pago."
            ? "Eliminá primero las imputaciones activas de este pago."
            : result.fieldErrors.paymentId,
      },
    };
  }

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

async function listActivePaymentImputations(paymentId: string) {
  return await db
    .select({
      amount: academyEventInvoiceImputations.amount,
      imputationDate: academyEventInvoiceImputations.imputationDate,
    })
    .from(academyEventInvoiceImputations)
    .where(
      and(
        eq(academyEventInvoiceImputations.paymentId, paymentId),
        isNull(academyEventInvoiceImputations.annulledAt),
      ),
    );
}

function sumActiveImputedAmount(activeImputations: Array<{ amount: number }>) {
  return activeImputations.reduce(
    (total, imputation) => total + imputation.amount,
    0,
  );
}

function getPaymentEditAccountingFieldErrors(input: {
  activeImputations: Array<{ amount: number; imputationDate: string }>;
  currentAcademyId: string;
  nextAcademyId: string;
  nextAmount: number;
  nextPaymentDate: string;
}): Partial<Record<CreatePaymentFieldName, string>> {
  const fieldErrors: Partial<Record<CreatePaymentFieldName, string>> = {};
  const activeImputedAmount = sumActiveImputedAmount(input.activeImputations);
  const earliestImputationDate = input.activeImputations.reduce<string | null>(
    (earliestDate, imputation) => {
      if (!earliestDate || imputation.imputationDate < earliestDate) {
        return imputation.imputationDate;
      }

      return earliestDate;
    },
    null,
  );

  if (
    activeImputedAmount > 0 &&
    input.nextAcademyId !== input.currentAcademyId
  ) {
    fieldErrors.academyId =
      "No se puede cambiar la academia de un pago con imputaciones activas.";
  }

  if (input.nextAmount < activeImputedAmount) {
    fieldErrors.amount = "El monto no puede ser menor al total ya imputado.";
  }

  if (
    earliestImputationDate &&
    input.nextPaymentDate > earliestImputationDate
  ) {
    fieldErrors.paymentDate =
      "La fecha de pago no puede ser posterior a una imputación activa.";
  }

  return fieldErrors;
}
