import { and, desc, eq, isNull } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import {
  academies,
  academyEventChoreographyInvoices,
  academyEventPayments,
  choreographies,
} from "@/db/schema";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  annulPayment,
  annulPaymentImputation,
  cancelDepositInvoice,
  type CorrectionResult,
} from "@/lib/finances/account-current-corrections.server";
import {
  issueDepositInvoices,
  issueBalanceInvoice,
  previewBalanceInvoice,
} from "@/lib/finances/choreography-invoices.server";
import {
  createPaymentImputation,
  deriveChoreographyFinancialStates,
  getInvoiceState,
  listActiveImputationTotalsByIds,
  listActiveImputationsForAcademyEvent,
} from "@/lib/finances/payment-imputations.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { getFieldErrors } from "@/lib/shared/form-validation";
import {
  readBalanceInvoiceCandidates,
  readDepositInvoiceCandidates,
} from "./invoice-candidates.server";
import {
  readAcademyEventPaymentSummary,
  registerAcademyEventPayment,
} from "./payments.server";

import {
  annulImputationSchema,
  annulPaymentSchema,
  balanceInvoiceFieldNames,
  balanceInvoiceSchema,
  cancelInvoiceSchema,
  type AccountCurrentCorrectionFormValues,
  correctionFieldNames,
  defaultAccountCurrentActionValues,
  defaultAccountCurrentCorrectionValues,
  defaultBalanceInvoiceValues,
  defaultIssueDepositInvoicesValues,
  defaultPaymentImputationValues,
  defaultRegisterPaymentValues,
  imputationFieldNames,
  invoiceFieldNames,
  issueDepositInvoicesSchema,
  paymentFieldNames,
  paymentImputationSchema,
  readAccountCurrentCorrectionValues,
  readBalanceInvoiceValues,
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
    activeInvoices,
    depositInvoiceCandidates,
    balanceInvoiceCandidates,
    imputations,
    movements,
  ] =
    eventContext.selectedEventId === null
      ? [[], [], [], [], [], []]
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
          readActiveInvoices({
            academyId: academy.id,
            eventId: eventContext.selectedEventId,
          }),
          readDepositInvoiceCandidates({
            academyId: academy.id,
            eventId: eventContext.selectedEventId,
          }),
          readBalanceInvoiceCandidates({
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
    invoiceIds: activeInvoices.map((invoice) => invoice.id),
    paymentIds: payments.map((payment) => payment.id),
  });
  const choreographyFinancialStates = await deriveChoreographyFinancialStates([
    ...new Set(activeInvoices.map((invoice) => invoice.choreographyId)),
  ]);
  const hydratedPayments = payments.map((payment) => {
    const imputedAmount = imputationTotals.paymentTotals.get(payment.id) ?? 0;

    return {
      ...payment,
      availableAmount: payment.amount - imputedAmount,
      imputedAmount,
    };
  });
  const hydratedInvoices = activeInvoices.map((invoice) => {
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
    activeBalanceInvoices: hydratedInvoices.filter(
      (invoice) => invoice.invoiceType === "saldo",
    ),
    activeDepositInvoices: hydratedInvoices.filter(
      (invoice) => invoice.invoiceType === "sena",
    ),
    balanceInvoiceCandidates,
    depositInvoiceCandidates,
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
          balanceInvoice: defaultBalanceInvoiceValues(),
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
          balanceInvoice: defaultBalanceInvoiceValues(),
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
          balanceInvoice: defaultBalanceInvoiceValues(),
          correction: defaultAccountCurrentCorrectionValues(),
          imputation: defaultPaymentImputationValues(),
          invoice: values,
          payment: defaultRegisterPaymentValues(),
        },
      };
    }

    throw redirect(input.request.url);
  }

  if (intent === "preview-balance-invoice") {
    const values = readBalanceInvoiceValues(formData);
    const parsed = balanceInvoiceSchema.safeParse(values);

    if (!parsed.success) {
      return {
        status: "error",
        message: "Revisá los datos de la factura.",
        fieldErrors: getFieldErrors(parsed.error, balanceInvoiceFieldNames),
        values: {
          balanceInvoice: values,
          correction: defaultAccountCurrentCorrectionValues(),
          imputation: defaultPaymentImputationValues(),
          invoice: defaultIssueDepositInvoicesValues(),
          payment: defaultRegisterPaymentValues(),
        },
      };
    }

    const result = await previewBalanceInvoice({
      academyId,
      administrativeDiscountAmount: Number(
        parsed.data.administrativeDiscountAmount,
      ),
      administrativeDiscountInternalReason:
        parsed.data.administrativeDiscountInternalReason || null,
      administrativeDiscountPublicLabel:
        parsed.data.administrativeDiscountPublicLabel || null,
      choreographyId: parsed.data.choreographyId,
      eventId,
      issueDate: parsed.data.issueDate,
    });

    if (!result.ok) {
      return {
        status: "error",
        message: result.message,
        fieldErrors: result.fieldErrors,
        values: {
          balanceInvoice: values,
          correction: defaultAccountCurrentCorrectionValues(),
          imputation: defaultPaymentImputationValues(),
          invoice: defaultIssueDepositInvoicesValues(),
          payment: defaultRegisterPaymentValues(),
        },
      };
    }

    return {
      status: "preview",
      preview: result.preview,
      values: {
        balanceInvoice: values,
        correction: defaultAccountCurrentCorrectionValues(),
        imputation: defaultPaymentImputationValues(),
        invoice: defaultIssueDepositInvoicesValues(),
        payment: defaultRegisterPaymentValues(),
      },
    };
  }

  if (intent === "issue-balance-invoice") {
    const values = readBalanceInvoiceValues(formData);
    const parsed = balanceInvoiceSchema.safeParse(values);

    if (!parsed.success) {
      return {
        status: "error",
        message: "Revisá los datos de la factura.",
        fieldErrors: getFieldErrors(parsed.error, balanceInvoiceFieldNames),
        values: {
          balanceInvoice: values,
          correction: defaultAccountCurrentCorrectionValues(),
          imputation: defaultPaymentImputationValues(),
          invoice: defaultIssueDepositInvoicesValues(),
          payment: defaultRegisterPaymentValues(),
        },
      };
    }

    const result = await issueBalanceInvoice({
      academyId,
      administrativeDiscountAmount: Number(
        parsed.data.administrativeDiscountAmount,
      ),
      administrativeDiscountInternalReason:
        parsed.data.administrativeDiscountInternalReason || null,
      administrativeDiscountPublicLabel:
        parsed.data.administrativeDiscountPublicLabel || null,
      choreographyId: parsed.data.choreographyId,
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
          balanceInvoice: values,
          correction: defaultAccountCurrentCorrectionValues(),
          imputation: defaultPaymentImputationValues(),
          invoice: defaultIssueDepositInvoicesValues(),
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
          balanceInvoice: defaultBalanceInvoiceValues(),
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
          balanceInvoice: defaultBalanceInvoiceValues(),
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
  fieldErrors: Partial<Record<string, string>>;
  message: string;
  values: AccountCurrentCorrectionFormValues;
}): AdministrativeAcademyAccountCurrentActionData {
  return {
    status: "error",
    message: input.message,
    fieldErrors: input.fieldErrors,
    values: {
      balanceInvoice: defaultBalanceInvoiceValues(),
      correction: input.values,
      imputation: defaultPaymentImputationValues(),
      invoice: defaultIssueDepositInvoicesValues(),
      payment: defaultRegisterPaymentValues(),
    },
  };
}

async function readActiveInvoices(input: {
  academyId: string;
  eventId: string;
}) {
  return await db
    .select({
      administrativeDiscountAmount:
        academyEventChoreographyInvoices.administrativeDiscountAmount,
      administrativeDiscountPublicLabel:
        academyEventChoreographyInvoices.administrativeDiscountPublicLabel,
      amount: academyEventChoreographyInvoices.depositAmount,
      appliedDepositAmount:
        academyEventChoreographyInvoices.appliedDepositAmount,
      choreographyId: choreographies.id,
      choreographyName: choreographies.name,
      dancerDiscountAmount:
        academyEventChoreographyInvoices.dancerDiscountAmount,
      depositCompletedOn: academyEventChoreographyInvoices.depositCompletedOn,
      finalTotalAmount: academyEventChoreographyInvoices.finalTotalAmount,
      id: academyEventChoreographyInvoices.id,
      invoiceNumber: academyEventChoreographyInvoices.invoiceNumber,
      invoiceType: academyEventChoreographyInvoices.invoiceType,
      issueDate: academyEventChoreographyInvoices.issueDate,
      selectedPaymentDeadline:
        academyEventChoreographyInvoices.selectedPaymentDeadline,
      totalDiscountAmount: academyEventChoreographyInvoices.totalDiscountAmount,
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
        isNull(academyEventChoreographyInvoices.cancelledAt),
      ),
    )
    .orderBy(
      desc(academyEventChoreographyInvoices.issueDate),
      desc(academyEventChoreographyInvoices.invoiceNumber),
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

function readAcademyId(params: { academyId?: string }) {
  if (!params.academyId) {
    throw new Response("No encontramos esa academia.", { status: 404 });
  }

  return params.academyId;
}
