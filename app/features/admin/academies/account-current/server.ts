import { and, desc, eq, isNull } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies, academyEventPayments } from "@/db/schema";
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
  readActiveAcademyEventInvoices,
  readAcademyEventPaymentSummary,
} from "@/lib/finances/academy-account-current.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { getFieldErrors } from "@/lib/shared/form-validation";
import {
  readBalanceInvoiceCandidates,
  readDepositInvoiceCandidates,
} from "./invoice-candidates.server";
import { registerAcademyEventPayment } from "./payments.server";

import {
  annulImputationSchema,
  annulPaymentSchema,
  balanceInvoiceFieldNames,
  balanceInvoiceSchema,
  cancelInvoiceSchema,
  type AccountCurrentCorrectionFormValues,
  correctionFieldNames,
  defaultAccountCurrentActionValues,
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

type AccountCurrentActionContext = {
  academyId: string;
  adminUserId: string;
  eventId: string;
  formData: FormData;
  requestUrl: string;
};

type AccountCurrentActionHandler = (
  context: AccountCurrentActionContext,
) => Promise<AdministrativeAcademyAccountCurrentActionData | never>;

type AccountCurrentActionErrorData = Extract<
  AdministrativeAcademyAccountCurrentActionData,
  { status: "error" }
>;
type AccountCurrentPreviewData = Extract<
  AdministrativeAcademyAccountCurrentActionData,
  { status: "preview" }
>;
type AccountCurrentActionValues =
  AdministrativeAcademyAccountCurrentActionData["values"];

const accountCurrentActionHandlers: Partial<
  Record<string, AccountCurrentActionHandler>
> = {
  "annul-imputation": handleAnnulImputationAction,
  "annul-payment": handleAnnulPaymentAction,
  "cancel-invoice": handleCancelInvoiceAction,
  "impute-payment": handleImputePaymentAction,
  "issue-balance-invoice": handleIssueBalanceInvoiceAction,
  "issue-deposit-invoices": handleIssueDepositInvoicesAction,
  "preview-balance-invoice": handlePreviewBalanceInvoiceAction,
  "register-payment": handleRegisterPaymentAction,
};

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
          readActiveAcademyEventInvoices({
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

export async function handleAdministrativeAcademyAccountCurrentAction(input: {
  params: { academyId?: string };
  request: Request;
}): Promise<AdministrativeAcademyAccountCurrentActionData | never> {
  const adminUser = await requireAdminUser(input.request);
  const eventContext = await loadAdminEventContext(input.request);
  const academyId = readAcademyId(input.params);
  await readAcademy(academyId);

  if (eventContext.selectedEventId === null) {
    return accountCurrentActionError({
      fieldErrors: {},
      message: "Activá un evento para operar la cuenta corriente.",
    });
  }

  const eventId = eventContext.selectedEventId;
  const formData = await input.request.formData();
  const intent = String(formData.get("intent") ?? "");
  const handler = accountCurrentActionHandlers[intent];

  if (!handler) {
    return accountCurrentActionError({
      fieldErrors: {},
      message: "No pudimos procesar esa acción.",
    });
  }

  return await handler({
    academyId,
    adminUserId: adminUser.id,
    eventId,
    formData,
    requestUrl: input.request.url,
  });
}

async function handleRegisterPaymentAction(
  context: AccountCurrentActionContext,
) {
  const values = readRegisterPaymentValues(context.formData);
  const parsed = registerPaymentSchema.safeParse(values);

  if (!parsed.success) {
    return accountCurrentActionError({
      fieldErrors: getFieldErrors(parsed.error, paymentFieldNames),
      message: "Revisá los datos del pago.",
      values: { payment: values },
    });
  }

  await registerAcademyEventPayment({
    academyId: context.academyId,
    amount: Number(parsed.data.amount),
    createdByUserId: context.adminUserId,
    eventId: context.eventId,
    internalNote: parsed.data.internalNote || null,
    paymentDate: parsed.data.paymentDate,
    paymentMethod: parsed.data.paymentMethod,
    reference: parsed.data.reference || null,
  });

  throw redirect(context.requestUrl);
}

async function handleIssueDepositInvoicesAction(
  context: AccountCurrentActionContext,
) {
  const values = readIssueDepositInvoicesValues(context.formData);
  const parsed = issueDepositInvoicesSchema.safeParse(values);

  if (!parsed.success) {
    return accountCurrentActionError({
      fieldErrors: getFieldErrors(parsed.error, invoiceFieldNames),
      message: "Revisá los datos de la factura.",
      values: { invoice: values },
    });
  }

  const result = await issueDepositInvoices({
    academyId: context.academyId,
    choreographyIds: parsed.data.choreographyIds,
    createdByUserId: context.adminUserId,
    eventId: context.eventId,
    issueDate: parsed.data.issueDate,
  });

  if (!result.ok) {
    return accountCurrentActionError({
      fieldErrors: result.fieldErrors,
      message: result.message,
      values: { invoice: values },
    });
  }

  throw redirect(context.requestUrl);
}

async function handlePreviewBalanceInvoiceAction(
  context: AccountCurrentActionContext,
) {
  const values = readBalanceInvoiceValues(context.formData);
  const parsed = balanceInvoiceSchema.safeParse(values);

  if (!parsed.success) {
    return balanceInvoiceActionError({
      fieldErrors: getFieldErrors(parsed.error, balanceInvoiceFieldNames),
      message: "Revisá los datos de la factura.",
      values,
    });
  }

  const result = await previewBalanceInvoice({
    academyId: context.academyId,
    administrativeDiscountAmount: Number(
      parsed.data.administrativeDiscountAmount,
    ),
    administrativeDiscountInternalReason:
      parsed.data.administrativeDiscountInternalReason || null,
    administrativeDiscountPublicLabel:
      parsed.data.administrativeDiscountPublicLabel || null,
    choreographyId: parsed.data.choreographyId,
    eventId: context.eventId,
    issueDate: parsed.data.issueDate,
  });

  if (!result.ok) {
    return balanceInvoiceActionError({
      fieldErrors: result.fieldErrors,
      message: result.message,
      values,
    });
  }

  return accountCurrentPreview({
    preview: result.preview,
    values: { balanceInvoice: values },
  });
}

async function handleIssueBalanceInvoiceAction(
  context: AccountCurrentActionContext,
) {
  const values = readBalanceInvoiceValues(context.formData);
  const parsed = balanceInvoiceSchema.safeParse(values);

  if (!parsed.success) {
    return balanceInvoiceActionError({
      fieldErrors: getFieldErrors(parsed.error, balanceInvoiceFieldNames),
      message: "Revisá los datos de la factura.",
      values,
    });
  }

  const result = await issueBalanceInvoice({
    academyId: context.academyId,
    administrativeDiscountAmount: Number(
      parsed.data.administrativeDiscountAmount,
    ),
    administrativeDiscountInternalReason:
      parsed.data.administrativeDiscountInternalReason || null,
    administrativeDiscountPublicLabel:
      parsed.data.administrativeDiscountPublicLabel || null,
    choreographyId: parsed.data.choreographyId,
    createdByUserId: context.adminUserId,
    eventId: context.eventId,
    issueDate: parsed.data.issueDate,
  });

  if (!result.ok) {
    return balanceInvoiceActionError({
      fieldErrors: result.fieldErrors,
      message: result.message,
      values,
    });
  }

  throw redirect(context.requestUrl);
}

async function handleImputePaymentAction(context: AccountCurrentActionContext) {
  const values = readPaymentImputationValues(context.formData);
  const parsed = paymentImputationSchema.safeParse(values);

  if (!parsed.success) {
    return accountCurrentActionError({
      fieldErrors: getFieldErrors(parsed.error, imputationFieldNames),
      message: "Revisá los datos de la imputación.",
      values: { imputation: values },
    });
  }

  const result = await createPaymentImputation({
    academyId: context.academyId,
    amount: Number(parsed.data.amount),
    createdByUserId: context.adminUserId,
    eventId: context.eventId,
    imputationDate: parsed.data.imputationDate,
    invoiceId: parsed.data.invoiceId,
    paymentId: parsed.data.paymentId,
  });

  if (!result.ok) {
    return accountCurrentActionError({
      fieldErrors: result.fieldErrors,
      message: result.message,
      values: { imputation: values },
    });
  }

  throw redirect(context.requestUrl);
}

async function handleAnnulImputationAction(
  context: AccountCurrentActionContext,
) {
  return await handleCorrectionAction({
    formData: context.formData,
    requestUrl: context.requestUrl,
    schema: annulImputationSchema,
    run: (data) =>
      annulPaymentImputation({
        academyId: context.academyId,
        annulledByUserId: context.adminUserId,
        eventId: context.eventId,
        imputationId: data.imputationId,
        reason: data.reason,
      }),
  });
}

async function handleCancelInvoiceAction(context: AccountCurrentActionContext) {
  return await handleCorrectionAction({
    formData: context.formData,
    requestUrl: context.requestUrl,
    schema: cancelInvoiceSchema,
    run: (data) =>
      cancelDepositInvoice({
        academyId: context.academyId,
        cancelledByUserId: context.adminUserId,
        eventId: context.eventId,
        invoiceId: data.invoiceId,
        reason: data.reason,
      }),
  });
}

async function handleAnnulPaymentAction(context: AccountCurrentActionContext) {
  return await handleCorrectionAction({
    formData: context.formData,
    requestUrl: context.requestUrl,
    schema: annulPaymentSchema,
    run: (data) =>
      annulPayment({
        academyId: context.academyId,
        annulledByUserId: context.adminUserId,
        eventId: context.eventId,
        paymentId: data.paymentId,
        reason: data.reason,
      }),
  });
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

function accountCurrentActionError(input: {
  fieldErrors: Partial<Record<string, string>>;
  message: string;
  values?: Partial<AccountCurrentActionValues>;
}): AccountCurrentActionErrorData {
  return {
    status: "error",
    message: input.message,
    fieldErrors: input.fieldErrors,
    values: accountCurrentActionValues(input.values),
  };
}

function balanceInvoiceActionError(input: {
  fieldErrors: Partial<Record<string, string>>;
  message: string;
  values: AccountCurrentActionValues["balanceInvoice"];
}) {
  return accountCurrentActionError({
    fieldErrors: input.fieldErrors,
    message: input.message,
    values: { balanceInvoice: input.values },
  });
}

function accountCurrentPreview(input: {
  preview: AccountCurrentPreviewData["preview"];
  values?: Partial<AccountCurrentActionValues>;
}): AccountCurrentPreviewData {
  return {
    status: "preview",
    preview: input.preview,
    values: accountCurrentActionValues(input.values),
  };
}

function accountCurrentActionValues(
  values: Partial<AccountCurrentActionValues> = {},
): AccountCurrentActionValues {
  return {
    ...defaultAccountCurrentActionValues(),
    ...values,
  };
}

function correctionActionError(input: {
  fieldErrors: Partial<Record<string, string>>;
  message: string;
  values: AccountCurrentCorrectionFormValues;
}): AdministrativeAcademyAccountCurrentActionData {
  return accountCurrentActionError({
    fieldErrors: input.fieldErrors,
    message: input.message,
    values: { correction: input.values },
  });
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
