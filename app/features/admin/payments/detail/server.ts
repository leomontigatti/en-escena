import { eq } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import {
  academies,
  choreographies,
  choreographyDancers,
  paymentAllocations,
  payments,
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
import { deletePaymentWithAllocations } from "@/lib/finances/choreography-cobro.server";
import { deriveInscriptionFinancialState } from "@/lib/finances/operational-summary-calculations.server";
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
      listAdminPaymentAcademyOptions(),
      sumPaymentAllocatedAmount(paymentDetail.id),
      listPaymentAffectedChoreographies(paymentDetail.id),
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

export type PaymentAffectedChoreography = {
  blocksDeletion: boolean;
  id: string;
  name: string;
};

/**
 * Coreografías cuyas inscripciones tienen asignaciones a este pago, sin
 * duplicar (una coreografía aparece una sola vez). `blocksDeletion` marca las
 * que impedirían la cascada: una inscripción `pagada` cuya `deposit` está en
 * este pago pero cuyo `balance` vive en otro pago (borrar la seña la dejaría
 * pagada sin seña). Es una marca suave para la UI; el server es la fuente de
 * verdad al confirmar.
 */
async function listPaymentAffectedChoreographies(
  paymentId: string,
): Promise<PaymentAffectedChoreography[]> {
  const rows = await db
    .select({
      allocationType: paymentAllocations.allocationType,
      balanceReferenceDate: choreographyDancers.balanceReferenceDate,
      choreographyId: choreographies.id,
      choreographyName: choreographies.name,
      depositReferenceDate: choreographyDancers.depositReferenceDate,
      inscriptionId: paymentAllocations.inscriptionId,
    })
    .from(paymentAllocations)
    .innerJoin(
      choreographyDancers,
      eq(paymentAllocations.inscriptionId, choreographyDancers.id),
    )
    .innerJoin(
      choreographies,
      eq(choreographyDancers.choreographyId, choreographies.id),
    )
    .where(eq(paymentAllocations.paymentId, paymentId));

  // Por inscripción: si acá está la seña, si acá está el saldo y su estado.
  const inscriptions = new Map<
    string,
    { hasBalanceHere: boolean; hasDepositHere: boolean; isPaid: boolean }
  >();
  for (const row of rows) {
    const entry = inscriptions.get(row.inscriptionId) ?? {
      hasBalanceHere: false,
      hasDepositHere: false,
      isPaid:
        deriveInscriptionFinancialState({
          balanceReferenceDate: row.balanceReferenceDate,
          depositReferenceDate: row.depositReferenceDate,
        }) === "pagada",
    };
    if (row.allocationType === "deposit") {
      entry.hasDepositHere = true;
    } else {
      entry.hasBalanceHere = true;
    }
    inscriptions.set(row.inscriptionId, entry);
  }

  // Dedup por coreografía; bloquea si alguna de sus inscripciones bloquea.
  const choreographyList = new Map<string, PaymentAffectedChoreography>();
  for (const row of rows) {
    const inscription = inscriptions.get(row.inscriptionId);
    const blocks = Boolean(
      inscription &&
      inscription.isPaid &&
      inscription.hasDepositHere &&
      !inscription.hasBalanceHere,
    );
    const existing = choreographyList.get(row.choreographyId);
    choreographyList.set(row.choreographyId, {
      blocksDeletion: (existing?.blocksDeletion ?? false) || blocks,
      id: row.choreographyId,
      name: row.choreographyName,
    });
  }

  return [...choreographyList.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "es"),
  );
}

export async function handleAdminPaymentDetailAction(
  request: Request,
  paymentId: string,
): Promise<AdminPaymentDetailActionData | never> {
  await requireAdminUser(request);
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
      intent: updateAdminPaymentIntent,
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
      intent: updateAdminPaymentIntent,
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

  throw redirect(input.requestUrl);
}

async function deleteAdminPayment(input: {
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

  const payment = await db.query.payments.findFirst({
    columns: {
      eventId: true,
    },
    where: eq(payments.id, input.paymentId),
  });

  if (!payment) {
    throw new Response("No encontramos ese pago.", { status: 404 });
  }

  const result = await deletePaymentWithAllocations({
    paymentId: input.paymentId,
  });

  if (!result.ok) {
    return {
      status: "error",
      intent: deleteAdminPaymentIntent,
      message: "No se pudo eliminar el pago.",
      fieldErrors: {
        paymentId: result.message,
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
