import { and, desc, eq, isNull } from "drizzle-orm";
import { redirect } from "react-router";

import { db } from "@/db";
import { academies, academyEventPayments } from "@/db/schema";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { emptyOperationalFinanceSummary } from "@/lib/finances/operational-summary";
import { readAcademyEventOperationalFinanceDetail } from "@/lib/finances/operational-summary.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { getFieldErrors } from "@/lib/shared/form-validation";
import { registerAcademyEventPayment } from "./payments.server";

import {
  defaultAccountCurrentActionValues,
  paymentFieldNames,
  readRegisterPaymentValues,
  registerPaymentSchema,
  type AdministrativeAcademyAccountCurrentActionData,
} from "./shared";

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
type AccountCurrentActionValues =
  AdministrativeAcademyAccountCurrentActionData["values"];

const accountCurrentActionHandlers: Partial<
  Record<string, AccountCurrentActionHandler>
> = {
  "register-payment": handleRegisterPaymentAction,
};

export async function loadAdministrativeAcademyAccountCurrent(input: {
  params: { academyId?: string };
  request: Request;
}) {
  const user = await requireInternalUser(input.request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(input.request);
  const academy = await readAcademy(readAcademyId(input.params));

  const [financeDetail, payments] =
    eventContext.selectedEventId === null
      ? [
          {
            choreographyFinanceRows: [],
            summary: emptyOperationalFinanceSummary(),
          },
          [],
        ]
      : await Promise.all([
          readAcademyEventOperationalFinanceDetail({
            academyId: academy.id,
            eventId: eventContext.selectedEventId,
          }),
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
        ]);

  return {
    academy,
    canRegisterPayments: user.role === "admin",
    choreographyFinanceRows: financeDetail.choreographyFinanceRows,
    payments,
    selectedEventId: eventContext.selectedEventId,
    summary: financeDetail.summary,
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

function accountCurrentActionValues(
  values: Partial<AccountCurrentActionValues> = {},
): AccountCurrentActionValues {
  return {
    ...defaultAccountCurrentActionValues(),
    ...values,
  };
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
