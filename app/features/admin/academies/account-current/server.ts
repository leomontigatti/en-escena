import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import {
  academies,
  academyEventChoreographyInvoices,
  academyEventInvoiceImputations,
  academyEventPayments,
  choreographies,
  eventFinancialSequences,
  modalities,
  scheduleCapacities,
  schedules,
  submodalities,
} from "@/db/schema";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  annulPayment,
  annulPaymentImputation,
  cancelDepositInvoice,
} from "@/lib/finances/account-current-corrections.server";
import {
  issueDepositInvoices,
  listActiveInvoiceChoreographyIds,
} from "@/lib/finances/choreography-invoices.server";
import {
  createPaymentImputation,
  deriveChoreographyFinancialStates,
  getInvoiceState,
  listActiveImputationTotalsByIds,
  listActiveImputationsForAcademyEvent,
} from "@/lib/finances/payment-imputations.server";
import { resolveApplicablePrice } from "@/lib/events/bases-repository.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { getFieldErrors } from "@/lib/shared/form-validation";

import {
  annulImputationSchema,
  annulPaymentSchema,
  type AccountCurrentCorrectionFormValues,
  cancelInvoiceSchema,
  defaultAccountCurrentActionValues,
  defaultAccountCurrentCorrectionValues,
  defaultIssueDepositInvoicesValues,
  defaultPaymentImputationValues,
  defaultRegisterPaymentValues,
  correctionFieldNames,
  imputationFieldNames,
  invoiceFieldNames,
  issueDepositInvoicesSchema,
  paymentFieldNames,
  paymentImputationSchema,
  readAccountCurrentCorrectionValues,
  readIssueDepositInvoicesValues,
  readPaymentImputationValues,
  readRegisterPaymentValues,
  registerPaymentSchema,
  type AdministrativeAcademyAccountCurrentActionData,
} from "./shared";
import { listAccountCurrentMovements } from "./movements";

type CorrectionSchema =
  | typeof annulImputationSchema
  | typeof annulPaymentSchema
  | typeof cancelInvoiceSchema;

type CorrectionResult = Awaited<ReturnType<typeof annulPaymentImputation>>;

export async function loadAdministrativeAcademyAccountCurrent(input: {
  params: { academyId?: string };
  request: Request;
}) {
  const user = await requireInternalUser(input.request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(input.request);
  const academy = await readAcademy(readAcademyId(input.params));

  const summary =
    eventContext.selectedEventId === null
      ? { totalPaidAmount: 0, availableBalanceAmount: 0, owedAmount: 0 }
      : await readAcademyEventPaymentSummary({
          academyId: academy.id,
          eventId: eventContext.selectedEventId,
        });
  const [
    payments,
    activeDepositInvoices,
    depositInvoiceCandidates,
    imputations,
    movements,
  ] =
    eventContext.selectedEventId === null
      ? [[], [], [], [], []]
      : await Promise.all([
          db.query.academyEventPayments.findMany({
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
          }),
          readActiveDepositInvoices({
            academyId: academy.id,
            eventId: eventContext.selectedEventId,
          }),
          readDepositInvoiceCandidates({
            academyId: academy.id,
            eventId: eventContext.selectedEventId,
          }),
          listActiveImputationsForAcademyEvent({
            academyId: academy.id,
            eventId: eventContext.selectedEventId,
          }),
          listAccountCurrentMovements({
            academyId: academy.id,
            eventId: eventContext.selectedEventId,
          }),
        ]);

  const imputationTotals = await listActiveImputationTotalsByIds({
    invoiceIds: activeDepositInvoices.map((invoice) => invoice.id),
    paymentIds: payments.map((payment) => payment.id),
  });
  const choreographyFinancialStates = await deriveChoreographyFinancialStates(
    activeDepositInvoices.map((invoice) => invoice.choreographyId),
  );
  const hydratedPayments = payments.map((payment) => {
    const imputedAmount = imputationTotals.paymentTotals.get(payment.id) ?? 0;

    return {
      ...payment,
      availableAmount: payment.amount - imputedAmount,
      imputedAmount,
    };
  });
  const hydratedDepositInvoices = activeDepositInvoices.map((invoice) => {
    const imputedAmount = imputationTotals.invoiceTotals.get(invoice.id) ?? 0;
    const pendingAmount = Math.max(0, invoice.amount - imputedAmount);

    return {
      ...invoice,
      choreographyFinancialState:
        choreographyFinancialStates.get(invoice.choreographyId) ?? "impaga",
      imputedAmount,
      pendingAmount,
      status: getInvoiceState({
        amount: invoice.amount,
        imputedAmount,
      }),
    };
  });

  return {
    academy,
    canCorrectRecords: user.role === "admin",
    canIssueInvoices: user.role === "admin",
    canImputePayments: user.role === "admin",
    canRegisterPayments: user.role === "admin",
    depositInvoiceCandidates,
    activeDepositInvoices: hydratedDepositInvoices,
    imputations,
    movements,
    payments: hydratedPayments,
    selectedEventId: eventContext.selectedEventId,
    summary,
  };
}

// fallow-ignore-next-line complexity
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
      message: "Activá un evento para operar la cuenta corriente.",
      fieldErrors: {},
      values: defaultAccountCurrentActionValues(),
    };
  }

  const eventId = eventContext.selectedEventId;
  const formData = await input.request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "register-payment") {
    const values = readRegisterPaymentValues(formData);
    const parsed = registerPaymentSchema.safeParse(values);

    if (!parsed.success) {
      return {
        status: "error",
        message: "Revisá los datos del pago.",
        fieldErrors: getFieldErrors(parsed.error, paymentFieldNames),
        values: {
          correction: defaultAccountCurrentCorrectionValues(),
          imputation: defaultPaymentImputationValues(),
          invoice: defaultIssueDepositInvoicesValues(),
          payment: values,
        },
      };
    }

    await registerAcademyEventPayment({
      academyId,
      amount: Number(parsed.data.amount),
      createdByUserId: adminUser.id,
      eventId,
      internalNote: parsed.data.internalNote || null,
      paymentDate: parsed.data.paymentDate,
      paymentMethod: parsed.data.paymentMethod,
      reference: parsed.data.reference || null,
    });

    throw redirect(input.request.url);
  }

  if (intent === "issue-deposit-invoices") {
    const values = readIssueDepositInvoicesValues(formData);
    const parsed = issueDepositInvoicesSchema.safeParse(values);

    if (!parsed.success) {
      return {
        status: "error",
        message: "Revisá los datos de la factura.",
        fieldErrors: getFieldErrors(parsed.error, invoiceFieldNames),
        values: {
          correction: defaultAccountCurrentCorrectionValues(),
          imputation: defaultPaymentImputationValues(),
          invoice: values,
          payment: defaultRegisterPaymentValues(),
        },
      };
    }

    const result = await issueDepositInvoices({
      academyId,
      choreographyIds: parsed.data.choreographyIds,
      createdByUserId: adminUser.id,
      eventId,
      issueDate: parsed.data.issueDate,
    });

    if (!result.ok) {
      return {
        status: "error",
        message: result.message,
        fieldErrors: result.fieldErrors,
        values: {
          correction: defaultAccountCurrentCorrectionValues(),
          imputation: defaultPaymentImputationValues(),
          invoice: values,
          payment: defaultRegisterPaymentValues(),
        },
      };
    }

    throw redirect(input.request.url);
  }

  if (intent === "impute-payment") {
    const values = readPaymentImputationValues(formData);
    const parsed = paymentImputationSchema.safeParse(values);

    if (!parsed.success) {
      return {
        status: "error",
        message: "Revisá los datos de la imputación.",
        fieldErrors: getFieldErrors(parsed.error, imputationFieldNames),
        values: {
          correction: defaultAccountCurrentCorrectionValues(),
          imputation: values,
          invoice: defaultIssueDepositInvoicesValues(),
          payment: defaultRegisterPaymentValues(),
        },
      };
    }

    const result = await createPaymentImputation({
      academyId,
      amount: Number(parsed.data.amount),
      createdByUserId: adminUser.id,
      eventId,
      imputationDate: parsed.data.imputationDate,
      invoiceId: parsed.data.invoiceId,
      paymentId: parsed.data.paymentId,
    });

    if (!result.ok) {
      return {
        status: "error",
        message: result.message,
        fieldErrors: result.fieldErrors,
        values: {
          correction: defaultAccountCurrentCorrectionValues(),
          imputation: values,
          invoice: defaultIssueDepositInvoicesValues(),
          payment: defaultRegisterPaymentValues(),
        },
      };
    }

    throw redirect(input.request.url);
  }

  if (intent === "annul-imputation") {
    return await handleCorrectionAction({
      formData,
      requestUrl: input.request.url,
      schema: annulImputationSchema,
      run: (data) =>
        annulPaymentImputation({
          academyId,
          annulledByUserId: adminUser.id,
          eventId,
          imputationId: data.imputationId,
          reason: data.reason,
        }),
    });
  }

  if (intent === "cancel-invoice") {
    return await handleCorrectionAction({
      formData,
      requestUrl: input.request.url,
      schema: cancelInvoiceSchema,
      run: (data) =>
        cancelDepositInvoice({
          academyId,
          cancelledByUserId: adminUser.id,
          eventId,
          invoiceId: data.invoiceId,
          reason: data.reason,
        }),
    });
  }

  if (intent === "annul-payment") {
    return await handleCorrectionAction({
      formData,
      requestUrl: input.request.url,
      schema: annulPaymentSchema,
      run: (data) =>
        annulPayment({
          academyId,
          annulledByUserId: adminUser.id,
          eventId,
          paymentId: data.paymentId,
          reason: data.reason,
        }),
    });
  }

  return {
    status: "error",
    message: "No pudimos procesar esa acción.",
    fieldErrors: {},
    values: defaultAccountCurrentActionValues(),
  };
}

async function handleCorrectionAction(input: {
  formData: FormData;
  requestUrl: string;
  run: (data: AccountCurrentCorrectionFormValues) => Promise<CorrectionResult>;
  schema: CorrectionSchema;
}): Promise<AdministrativeAcademyAccountCurrentActionData | never> {
  const values = readAccountCurrentCorrectionValues(input.formData);
  const parsed = input.schema.safeParse(values);

  if (!parsed.success) {
    return correctionActionError({
      fieldErrors: getFieldErrors(parsed.error, correctionFieldNames),
      message: "Revisá los datos de la corrección.",
      values,
    });
  }

  const result = await input.run(values);

  if (!result.ok) {
    return correctionActionError({
      fieldErrors: result.fieldErrors,
      message: result.message,
      values,
    });
  }

  throw redirect(input.requestUrl);
}

function correctionActionError(input: {
  fieldErrors: AdministrativeAcademyAccountCurrentActionData["fieldErrors"];
  message: string;
  values: AccountCurrentCorrectionFormValues;
}): AdministrativeAcademyAccountCurrentActionData {
  return {
    status: "error",
    message: input.message,
    fieldErrors: input.fieldErrors,
    values: {
      correction: input.values,
      imputation: defaultPaymentImputationValues(),
      invoice: defaultIssueDepositInvoicesValues(),
      payment: defaultRegisterPaymentValues(),
    },
  };
}

async function readActiveDepositInvoices(input: {
  academyId: string;
  eventId: string;
}) {
  return await db
    .select({
      amount: academyEventChoreographyInvoices.depositAmount,
      choreographyId: choreographies.id,
      choreographyName: choreographies.name,
      id: academyEventChoreographyInvoices.id,
      invoiceNumber: academyEventChoreographyInvoices.invoiceNumber,
      issueDate: academyEventChoreographyInvoices.issueDate,
      selectedPaymentDeadline:
        academyEventChoreographyInvoices.selectedPaymentDeadline,
    })
    .from(academyEventChoreographyInvoices)
    .innerJoin(
      choreographies,
      eq(academyEventChoreographyInvoices.choreographyId, choreographies.id),
    )
    .where(
      and(
        eq(academyEventChoreographyInvoices.academyId, input.academyId),
        eq(academyEventChoreographyInvoices.eventId, input.eventId),
        eq(academyEventChoreographyInvoices.invoiceType, "sena"),
        isNull(academyEventChoreographyInvoices.cancelledAt),
      ),
    )
    .orderBy(
      desc(academyEventChoreographyInvoices.issueDate),
      desc(academyEventChoreographyInvoices.invoiceNumber),
    );
}

async function readDepositInvoiceCandidates(input: {
  academyId: string;
  eventId: string;
}) {
  const choreographyRows = await db
    .select({
      createdAt: choreographies.createdAt,
      id: choreographies.id,
      modalityName: modalities.name,
      name: choreographies.name,
      groupType: choreographies.groupType,
      scheduleId: schedules.id,
      submodalityName: submodalities.name,
    })
    .from(choreographies)
    .innerJoin(modalities, eq(choreographies.modalityId, modalities.id))
    .leftJoin(submodalities, eq(choreographies.submodalityId, submodalities.id))
    .leftJoin(
      scheduleCapacities,
      eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
    )
    .leftJoin(
      schedules,
      or(
        eq(choreographies.scheduleId, schedules.id),
        eq(scheduleCapacities.scheduleId, schedules.id),
      ),
    )
    .where(
      and(
        eq(choreographies.academyId, input.academyId),
        eq(choreographies.eventId, input.eventId),
      ),
    )
    .orderBy(asc(choreographies.name), asc(choreographies.createdAt));

  const activeInvoiceIds = await listActiveInvoiceChoreographyIds(
    choreographyRows.map((row) => row.id),
  );
  const eligibleRows = choreographyRows.filter(
    (row) => !activeInvoiceIds.has(row.id),
  );

  return await Promise.all(
    eligibleRows.map(async (row) => {
      const priceResult = await resolveApplicablePrice({
        eventId: input.eventId,
        groupType: row.groupType,
        paymentDate: new Date(),
        scheduleId: row.scheduleId,
      });

      return {
        createdOn: row.createdAt.toISOString().slice(0, 10),
        estimatedBasePriceAmount: priceResult.ok
          ? priceResult.price.amount
          : null,
        id: row.id,
        modalityLabel: [row.modalityName, row.submodalityName]
          .filter(Boolean)
          .join(" / "),
        name: row.name,
        selectedPaymentDeadline:
          priceResult.ok === true ? priceResult.price.paymentDeadline : null,
      };
    }),
  );
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
  const [[paymentRow], [invoiceRow], [imputationRow]] = await Promise.all([
    db
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
      ),
    db
      .select({
        totalInvoiceAmount:
          sql<number>`coalesce(sum(${academyEventChoreographyInvoices.depositAmount}), 0)`.mapWith(
            Number,
          ),
      })
      .from(academyEventChoreographyInvoices)
      .where(
        and(
          eq(academyEventChoreographyInvoices.academyId, input.academyId),
          eq(academyEventChoreographyInvoices.eventId, input.eventId),
          eq(academyEventChoreographyInvoices.invoiceType, "sena"),
          isNull(academyEventChoreographyInvoices.cancelledAt),
        ),
      ),
    db
      .select({
        totalImputedAmount:
          sql<number>`coalesce(sum(${academyEventInvoiceImputations.amount}), 0)`.mapWith(
            Number,
          ),
      })
      .from(academyEventInvoiceImputations)
      .where(
        and(
          eq(academyEventInvoiceImputations.academyId, input.academyId),
          eq(academyEventInvoiceImputations.eventId, input.eventId),
          isNull(academyEventInvoiceImputations.annulledAt),
        ),
      ),
  ]);
  const totalPaidAmount = Number(paymentRow?.totalPaidAmount ?? 0);
  const totalInvoiceAmount = Number(invoiceRow?.totalInvoiceAmount ?? 0);
  const totalImputedAmount = Number(imputationRow?.totalImputedAmount ?? 0);

  return {
    totalPaidAmount,
    availableBalanceAmount: totalPaidAmount - totalImputedAmount,
    owedAmount: Math.max(0, totalInvoiceAmount - totalImputedAmount),
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
