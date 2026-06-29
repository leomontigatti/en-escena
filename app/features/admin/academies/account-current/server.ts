import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import {
  academies,
  academyEventPayments,
  eventFinancialSequences,
} from "@/db/schema";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { getFieldErrors } from "@/lib/shared/form-validation";

import {
  defaultRegisterPaymentValues,
  paymentFieldNames,
  readRegisterPaymentValues,
  registerPaymentSchema,
  type AdministrativeAcademyAccountCurrentActionData,
} from "./shared";

export async function loadAdministrativeAcademyAccountCurrent(input: {
  params: { academyId?: string };
  request: Request;
}) {
  const user = await requireInternalUser(input.request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(input.request);
  const academy = await readAcademy(readAcademyId(input.params));

  const payments =
    eventContext.selectedEventId === null
      ? []
      : await db.query.academyEventPayments.findMany({
          columns: {
            id: true,
            paymentNumber: true,
            paymentDate: true,
            amount: true,
            paymentMethod: true,
            reference: true,
            internalNote: true,
          },
          where: and(
            eq(academyEventPayments.academyId, academy.id),
            eq(academyEventPayments.eventId, eventContext.selectedEventId),
            isNull(academyEventPayments.annulledAt),
          ),
          orderBy: [
            desc(academyEventPayments.paymentDate),
            desc(academyEventPayments.paymentNumber),
            desc(academyEventPayments.createdAt),
          ],
        });
  const summary =
    eventContext.selectedEventId === null
      ? { totalPaidAmount: 0, availableBalanceAmount: 0 }
      : await readAcademyEventPaymentSummary({
          academyId: academy.id,
          eventId: eventContext.selectedEventId,
        });

  return {
    academy,
    canRegisterPayments: user.role === "admin",
    payments,
    selectedEventId: eventContext.selectedEventId,
    summary,
  };
}

export async function handleAdministrativeAcademyAccountCurrentAction(input: {
  params: { academyId?: string };
  request: Request;
}): Promise<AdministrativeAcademyAccountCurrentActionData | never> {
  const adminUser = await requireAdminUser(input.request);
  const eventContext = await loadAdminEventContext(input.request);
  const academyId = readAcademyId(input.params);
  await readAcademy(academyId);

  if (eventContext.selectedEventId === null) {
    return {
      status: "error",
      message: "Activá un evento para registrar pagos.",
      fieldErrors: {},
      values: defaultRegisterPaymentValues(),
    };
  }

  const formData = await input.request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent !== "register-payment") {
    return {
      status: "error",
      message: "No pudimos procesar esa acción.",
      fieldErrors: {},
      values: defaultRegisterPaymentValues(),
    };
  }

  const values = readRegisterPaymentValues(formData);
  const parsed = registerPaymentSchema.safeParse(values);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Revisá los datos del pago.",
      fieldErrors: getFieldErrors(parsed.error, paymentFieldNames),
      values,
    };
  }

  await registerAcademyEventPayment({
    academyId,
    amount: Number(parsed.data.amount),
    createdByUserId: adminUser.id,
    eventId: eventContext.selectedEventId,
    internalNote: parsed.data.internalNote || null,
    paymentDate: parsed.data.paymentDate,
    paymentMethod: parsed.data
      .paymentMethod as (typeof academyEventPayments.$inferInsert)["paymentMethod"],
    reference: parsed.data.reference || null,
  });

  throw redirect(input.request.url);
}

async function readAcademy(academyId: string) {
  const academy = await db.query.academies.findFirst({
    columns: {
      id: true,
      name: true,
      contactName: true,
      phone: true,
    },
    where: eq(academies.id, academyId),
  });

  if (!academy) {
    throw new Response("No encontramos esa academia.", { status: 404 });
  }

  return academy;
}

async function readAcademyEventPaymentSummary(input: {
  academyId: string;
  eventId: string;
}) {
  const [row] = await db
    .select({
      totalPaidAmount:
        sql<number>`coalesce(sum(${academyEventPayments.amount}), 0)`.mapWith(
          Number,
        ),
    })
    .from(academyEventPayments)
    .where(
      and(
        eq(academyEventPayments.academyId, input.academyId),
        eq(academyEventPayments.eventId, input.eventId),
        isNull(academyEventPayments.annulledAt),
      ),
    );
  const totalPaidAmount = Number(row?.totalPaidAmount ?? 0);

  return {
    totalPaidAmount,
    availableBalanceAmount: totalPaidAmount,
  };
}

async function registerAcademyEventPayment(input: {
  academyId: string;
  amount: number;
  createdByUserId: string;
  eventId: string;
  internalNote: string | null;
  paymentDate: string;
  paymentMethod: (typeof academyEventPayments.$inferInsert)["paymentMethod"];
  reference: string | null;
}) {
  return await db.transaction(async (tx) => {
    await tx
      .insert(eventFinancialSequences)
      .values({
        eventId: input.eventId,
      })
      .onConflictDoNothing();

    const [sequence] = await tx
      .select({
        nextPaymentNumber: eventFinancialSequences.nextPaymentNumber,
      })
      .from(eventFinancialSequences)
      .where(eq(eventFinancialSequences.eventId, input.eventId))
      .for("update");

    if (!sequence) {
      throw new Error("Expected event financial sequence to exist.");
    }

    const paymentNumber = sequence.nextPaymentNumber;

    await tx.insert(academyEventPayments).values({
      academyId: input.academyId,
      amount: input.amount,
      createdByUserId: input.createdByUserId,
      eventId: input.eventId,
      internalNote: input.internalNote,
      paymentDate: input.paymentDate,
      paymentMethod: input.paymentMethod,
      paymentNumber,
      reference: input.reference,
    });

    await tx
      .update(eventFinancialSequences)
      .set({
        nextPaymentNumber: paymentNumber + 1,
        updatedAt: new Date(),
      })
      .where(eq(eventFinancialSequences.eventId, input.eventId));
  });
}

function readAcademyId(params: { academyId?: string }) {
  if (!params.academyId) {
    throw new Response("No encontramos esa academia.", { status: 404 });
  }

  return params.academyId;
}
