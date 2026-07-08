import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import { expect } from "vitest";

import { db } from "@/db";
import {
  academies,
  academyEventChoreographyInvoices,
  academyEventInvoiceImputations,
  academyEventPayments,
  choreographies,
  events,
  eventFinancialSequences,
  scheduleCapacities,
  user,
} from "@/db/schema";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import { calculateDepositAmount } from "@/lib/finances/choreography-invoices.server";
import {
  createDepositInvoiceRecord,
  createChoreographyRecord,
  createEventCatalog,
} from "@/features/portal/choreographies/test-support/db";
import { resolveApplicablePrice } from "@/lib/prices/repository.server";
import {
  AdministracionAcademiasRouteView,
  loader as academiesLoader,
} from "@/routes/administracion.academias";
import {
  action as accountCurrentAction,
  AdministracionAcademiaCuentaCorrienteRouteView,
  loader as accountCurrentLoader,
} from "@/routes/administracion.academias_.$academyId";
import { AdministracionFacturasRouteView } from "@/routes/administracion.facturas";
import { loadAdminInvoicesList } from "@/features/admin/invoices/list/server";
import {
  AdministracionPagosRouteView,
  loader as financePaymentsLoader,
} from "@/routes/administracion.pagos";
import {
  AdministracionFinanzasRouteView,
  loader as financeAccountsLoader,
} from "@/routes/administracion.finanzas";
import { date as choreographyDate } from "@/features/portal/choreographies/test-support/db";

export async function createSavedEvent(
  overrides: Partial<Parameters<typeof createEvent>[0]> = {},
) {
  const result = await createEvent({
    name: "En Escena 2026",
    registrationStartsAt: choreographyDate("2026-03-01T12:00:00Z"),
    registrationEndsAt: choreographyDate("2026-04-30T12:00:00Z"),
    startsAt: choreographyDate("2026-05-01T12:00:00Z"),
    endsAt: choreographyDate("2026-05-03T12:00:00Z"),
    ...overrides,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  await activateEvent(result.event.id);

  return result.event;
}

export async function createInactiveEvent(name: string) {
  const result = await createEvent({
    name,
    registrationStartsAt: choreographyDate("2025-03-01T12:00:00Z"),
    registrationEndsAt: choreographyDate("2025-04-30T12:00:00Z"),
    startsAt: choreographyDate("2025-05-01T12:00:00Z"),
    endsAt: choreographyDate("2025-05-03T12:00:00Z"),
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.event;
}

// fallow-ignore-next-line code-duplication
export async function createSignedInRequest(input: {
  email: string;
  role: "academy" | "admin" | "auditor" | "judge";
  requestUrl: string;
}) {
  const signUpResult = await createLocalAccessUser({
    email: input.email,
    name: input.email,
    password: "password-segura",
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role: input.role,
    })
    .where(eq(user.id, signUpResult.response.user.id));

  return {
    userId: signUpResult.response.user.id,
    request: new Request(input.requestUrl, {
      headers: {
        cookie: createRequestCookie(signUpResult.headers),
      },
    }),
  };
}

export async function createAcademyUser(input: {
  email: string;
  academyName: string;
}) {
  const signIn = await createSignedInRequest({
    email: input.email,
    role: "academy",
    requestUrl: "http://localhost/portal",
  });

  const [academy] = await db
    .insert(academies)
    .values({
      userId: signIn.userId,
      name: input.academyName,
      contactName: input.academyName,
      phone: "11-5555-5555",
    })
    .returning();

  if (!academy) {
    throw new Error("Expected academy to be created.");
  }

  return {
    academy,
    user: {
      id: signIn.userId,
    },
  };
}

export async function createAccountCurrentChoreographyFixture(input: {
  academyName: string;
  choreographyName: string;
  email: string;
  event: Awaited<ReturnType<typeof createSavedEvent>>;
  catalog?: Awaited<ReturnType<typeof createEventCatalog>>;
}) {
  const academy = await createAcademyUser({
    email: input.email,
    academyName: input.academyName,
  });
  const catalog = input.catalog ?? (await createEventCatalog(input.event.id));
  const choreography = await createChoreographyRecord({
    academyId: academy.academy.id,
    categoryId: catalog.categoryWithLevel.id,
    createdAt: choreographyDate("2026-03-10T12:00:00Z"),
    eventId: input.event.id,
    experienceLevelId: catalog.level.id,
    modalityId: catalog.modality.id,
    name: input.choreographyName,
    scheduleCapacityId: catalog.scheduleCapacity.id,
    submodalityId: catalog.submodality.id,
  });

  return { academy, catalog, choreography };
}

export async function buildPaymentRequest(input: {
  amount: string;
  internalNote?: string;
  paymentDate: string;
  paymentMethod: string;
  reference?: string;
  requestUrl: string;
  role: "admin" | "auditor";
}) {
  const result = await buildSignedFormPostRequest(input, (formData) => {
    formData.set("intent", "register-payment");
    formData.set("amount", input.amount);
    formData.set("paymentDate", input.paymentDate);
    formData.set("paymentMethod", input.paymentMethod);
    formData.set("reference", input.reference ?? "");
    formData.set("internalNote", input.internalNote ?? "");
  });

  return { request: result.request };
}

export async function buildGlobalPaymentRequest(input: {
  academyId: string;
  amount: string;
  internalNote?: string;
  paymentDate: string;
  paymentMethod: string;
  reference?: string;
  requestUrl: string;
  role: "admin" | "auditor";
}) {
  const result = await buildSignedFormPostRequest(input, (formData) => {
    formData.set("intent", "create-payment");
    formData.set("academyId", input.academyId);
    formData.set("amount", input.amount);
    formData.set("paymentDate", input.paymentDate);
    formData.set("paymentMethod", input.paymentMethod);
    formData.set("reference", input.reference ?? "");
    formData.set("internalNote", input.internalNote ?? "");
  });

  return { request: result.request };
}

export async function buildBalanceInvoicePreviewRequest(input: {
  administrativeDiscountAmount?: string;
  administrativeDiscountInternalReason?: string;
  administrativeDiscountPublicLabel?: string;
  choreographyId: string;
  issueDate: string;
  requestUrl: string;
  role: "admin" | "auditor";
}) {
  const result = await buildSignedFormPostRequest(input, (formData) =>
    populateBalanceInvoiceFormData(formData, input, "preview-balance-invoice"),
  );

  return { request: result.request };
}

export async function buildBalanceInvoiceIssueRequest(input: {
  administrativeDiscountAmount?: string;
  administrativeDiscountInternalReason?: string;
  administrativeDiscountPublicLabel?: string;
  choreographyId: string;
  issueDate: string;
  requestUrl: string;
  role: "admin" | "auditor";
}) {
  const result = await buildSignedFormPostRequest(input, (formData) =>
    populateBalanceInvoiceFormData(formData, input, "issue-balance-invoice"),
  );

  return { request: result.request };
}

export async function buildPaymentImputationRequest(input: {
  imputationDate: string;
  invoiceId: string;
  paymentId: string;
  requestUrl: string;
  role: "admin" | "auditor";
}) {
  const result = await buildSignedFormPostRequest(input, (formData) => {
    formData.set("intent", "impute-payment");
    formData.set("imputationDate", input.imputationDate);
    formData.set("invoiceId", input.invoiceId);
    formData.set("paymentId", input.paymentId);
  });

  return { request: result.request };
}

export async function buildAnnulImputationRequest(input: {
  imputationId: string;
  reason: string;
  requestUrl: string;
  role: "admin" | "auditor";
}) {
  return await buildCorrectionRequest({
    fieldName: "imputationId",
    fieldValue: input.imputationId,
    intent: "annul-imputation",
    reason: input.reason,
    requestUrl: input.requestUrl,
    role: input.role,
  });
}

export async function buildCancelInvoiceRequest(input: {
  invoiceId: string;
  reason: string;
  requestUrl: string;
  role: "admin" | "auditor";
}) {
  return await buildCorrectionRequest({
    fieldName: "invoiceId",
    fieldValue: input.invoiceId,
    intent: "cancel-invoice",
    reason: input.reason,
    requestUrl: input.requestUrl,
    role: input.role,
  });
}

export async function buildAnnulPaymentRequest(input: {
  paymentId: string;
  reason: string;
  requestUrl: string;
  role: "admin" | "auditor";
}) {
  return await buildCorrectionRequest({
    fieldName: "paymentId",
    fieldValue: input.paymentId,
    intent: "annul-payment",
    reason: input.reason,
    requestUrl: input.requestUrl,
    role: input.role,
  });
}

async function buildCorrectionRequest(input: {
  fieldName: "imputationId" | "invoiceId" | "paymentId";
  fieldValue: string;
  intent: "annul-imputation" | "annul-payment" | "cancel-invoice";
  reason: string;
  requestUrl: string;
  role: "admin" | "auditor";
}) {
  return await buildSignedFormPostRequest(input, (formData) => {
    formData.set("intent", input.intent);
    formData.set(input.fieldName, input.fieldValue);
    formData.set("reason", input.reason);
  });
}

async function buildSignedFormPostRequest(
  input: {
    requestUrl: string;
    role: "admin" | "auditor";
  },
  populateFormData: (formData: FormData) => void,
) {
  const signedIn = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role: input.role,
    requestUrl: input.requestUrl,
  });
  const formData = new FormData();
  populateFormData(formData);

  return {
    userId: signedIn.userId,
    request: new Request(input.requestUrl, {
      method: "POST",
      body: formData,
      headers: {
        cookie: signedIn.request.headers.get("cookie") ?? "",
      },
    }),
  };
}

function populateBalanceInvoiceFormData(
  formData: FormData,
  input: {
    administrativeDiscountAmount?: string;
    administrativeDiscountInternalReason?: string;
    administrativeDiscountPublicLabel?: string;
    choreographyId: string;
    issueDate: string;
  },
  intent: "issue-balance-invoice" | "preview-balance-invoice",
) {
  formData.set("intent", intent);
  formData.set("choreographyId", input.choreographyId);
  formData.set("issueDate", input.issueDate);
  formData.set(
    "administrativeDiscountAmount",
    input.administrativeDiscountAmount ?? "0",
  );
  formData.set(
    "administrativeDiscountInternalReason",
    input.administrativeDiscountInternalReason ?? "",
  );
  formData.set(
    "administrativeDiscountPublicLabel",
    input.administrativeDiscountPublicLabel ?? "",
  );
}

export async function registerPaymentForTest(input: {
  academyId: string;
  amount: string;
  eventId: string;
  paymentDate: string;
}) {
  const { request } = await buildPaymentRequest({
    amount: input.amount,
    paymentDate: input.paymentDate,
    paymentMethod: "transferencia",
    requestUrl: accountCurrentUrl(input.academyId, input.eventId),
    role: "admin",
  });

  await expect(
    accountCurrentAction(detailActionArgs(request, input.academyId)),
  ).rejects.toMatchObject({
    status: 302,
  });
}

export async function issueDepositInvoiceForTest(input: {
  academyId: string;
  choreographyIds: string[];
  eventId: string;
  issueDate: string;
}) {
  await db
    .insert(eventFinancialSequences)
    .values({
      eventId: input.eventId,
    })
    .onConflictDoNothing();

  const [academy, sequence, event] = await Promise.all([
    db.query.academies.findFirst({
      columns: {
        userId: true,
      },
      where: eq(academies.id, input.academyId),
    }),
    db.query.eventFinancialSequences.findFirst({
      columns: {
        nextInvoiceNumber: true,
      },
      where: eq(eventFinancialSequences.eventId, input.eventId),
    }),
    db.query.events.findFirst({
      columns: {
        requiredDepositPercentage: true,
      },
      where: eq(events.id, input.eventId),
    }),
  ]);

  if (!academy || !sequence || !event) {
    throw new Error(
      "Expected academy, event, and financial sequence fixtures.",
    );
  }

  let invoiceNumber = sequence.nextInvoiceNumber;

  for (const choreographyId of input.choreographyIds) {
    const choreography = await db
      .select({
        groupType: choreographies.groupType,
        scheduleId: scheduleCapacities.scheduleId,
      })
      .from(choreographies)
      .leftJoin(
        scheduleCapacities,
        eq(choreographies.scheduleCapacityId, scheduleCapacities.id),
      )
      .where(eq(choreographies.id, choreographyId))
      .then((rows) => rows[0]);

    if (!choreography) {
      throw new Error("Expected choreography fixture.");
    }

    const priceResult = await resolveApplicablePrice({
      eventId: input.eventId,
      groupType: choreography.groupType,
      paymentDate: input.issueDate,
      scheduleId: choreography.scheduleId,
    });

    if (!priceResult.ok) {
      throw new Error("Expected applicable price fixture.");
    }

    await createDepositInvoiceRecord({
      academyId: input.academyId,
      basePriceAmount: priceResult.price.amount,
      choreographyId,
      createdByUserId: academy.userId,
      depositAmount: calculateDepositAmount({
        amount: priceResult.price.amount,
        percentage: event.requiredDepositPercentage,
      }),
      eventId: input.eventId,
      invoiceNumber: invoiceNumber++,
      issueDate: input.issueDate,
      requiredDepositPercentageSnapshot: event.requiredDepositPercentage,
      selectedPaymentDeadline: priceResult.price.paymentDeadline,
      selectedPriceId: priceResult.price.id,
    });
  }

  await db
    .update(eventFinancialSequences)
    .set({
      nextInvoiceNumber: invoiceNumber,
      updatedAt: new Date(),
    })
    .where(eq(eventFinancialSequences.eventId, input.eventId));
}

export async function completeDepositInvoiceForTest(input: {
  academyId: string;
  choreographyId: string;
  createdByUserId: string;
  eventId: string;
  imputationDate?: string;
}) {
  const [payment, depositInvoice] = await Promise.all([
    db.query.academyEventPayments.findFirst({
      where: eq(academyEventPayments.academyId, input.academyId),
    }),
    db.query.academyEventChoreographyInvoices.findFirst({
      where: eq(
        academyEventChoreographyInvoices.choreographyId,
        input.choreographyId,
      ),
    }),
  ]);

  if (!payment || !depositInvoice) {
    throw new Error("Expected payment and deposit invoice fixtures.");
  }

  const imputationDate = input.imputationDate ?? "2026-03-21";

  await db.insert(academyEventInvoiceImputations).values({
    academyId: input.academyId,
    amount: depositInvoice.depositAmount,
    createdByUserId: input.createdByUserId,
    eventId: input.eventId,
    imputationDate,
    invoiceId: depositInvoice.id,
    paymentId: payment.id,
  });
  await db
    .update(academyEventChoreographyInvoices)
    .set({
      depositCompletedOn: imputationDate,
    })
    .where(eq(academyEventChoreographyInvoices.id, depositInvoice.id));

  return { depositInvoice, payment };
}

export async function createAccountCurrentInvoicePaymentFixture(input: {
  academyName: string;
  choreographyName: string;
  email: string;
  event: Awaited<ReturnType<typeof createSavedEvent>>;
  catalog?: Awaited<ReturnType<typeof createEventCatalog>>;
  invoiceIssueDate?: string;
  paymentAmount?: string;
  paymentDate?: string;
}) {
  const { academy, catalog, choreography } =
    await createAccountCurrentChoreographyFixture({
      academyName: input.academyName,
      catalog: input.catalog,
      choreographyName: input.choreographyName,
      email: input.email,
      event: input.event,
    });

  await registerPaymentForTest({
    academyId: academy.academy.id,
    amount: input.paymentAmount ?? "3000",
    eventId: input.event.id,
    paymentDate: input.paymentDate ?? "2026-03-15",
  });
  await issueDepositInvoiceForTest({
    academyId: academy.academy.id,
    choreographyIds: [choreography.id],
    eventId: input.event.id,
    issueDate: input.invoiceIssueDate ?? "2026-03-20",
  });

  const payment = await db.query.academyEventPayments.findFirst({
    where: eq(academyEventPayments.academyId, academy.academy.id),
  });
  const invoice = await db.query.academyEventChoreographyInvoices.findFirst({
    where: eq(academyEventChoreographyInvoices.choreographyId, choreography.id),
  });

  if (!payment || !invoice) {
    throw new Error("Expected payment and invoice fixtures to exist.");
  }

  return { academy, catalog, choreography, invoice, payment };
}

export function renderAcademiesRoute(input: {
  loaderData: Awaited<ReturnType<typeof academiesLoader>>;
}) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: ["/administracion/academias"],
      },
      createElement(AdministracionAcademiasRouteView, {
        loaderData: input.loaderData,
      }),
    ),
  );
}

export function renderAccountCurrentRoute(input: {
  loaderData: Awaited<ReturnType<typeof accountCurrentLoader>>;
}) {
  const routePath = `/administracion/academias/${input.loaderData.academy.id}`;
  const router = createMemoryRouter(
    [
      {
        path: "/administracion/academias/:academyId",
        element: createElement(AdministracionAcademiaCuentaCorrienteRouteView, {
          loaderData: input.loaderData,
        }),
      },
    ],
    {
      initialEntries: [routePath],
    },
  );

  return renderToStaticMarkup(
    createElement(RouterProvider, {
      router,
    }),
  );
}

export function renderFinanceAccountsRoute(input: {
  loaderData: Awaited<ReturnType<typeof financeAccountsLoader>>;
}) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: ["/administracion/finanzas"],
      },
      createElement(AdministracionFinanzasRouteView, {
        loaderData: input.loaderData,
      }),
    ),
  );
}

export function renderFinancePaymentsRoute(input: {
  loaderData: Awaited<ReturnType<typeof financePaymentsLoader>>;
}) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: ["/administracion/pagos"],
      },
      createElement(AdministracionPagosRouteView, {
        loaderData: input.loaderData,
      }),
    ),
  );
}

export function renderFinanceInvoicesRoute(input: {
  loaderData: Awaited<ReturnType<typeof loadAdminInvoicesList>>;
}) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: ["/administracion/facturas"],
      },
      createElement(AdministracionFacturasRouteView, {
        loaderData: input.loaderData,
      }),
    ),
  );
}

export function accountCurrentUrl(academyId: string, eventId: string) {
  return `http://localhost/administracion/academias/${academyId}?evento=${eventId}`;
}

export function reportUrl(eventId: string) {
  return `http://localhost/administracion/finanzas?evento=${eventId}`;
}

export function routeArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/academias",
  };
}

export function detailRouteArgs(request: Request, academyId: string) {
  return {
    request,
    params: { academyId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/academias/:academyId",
  };
}

export function detailActionArgs(request: Request, academyId: string) {
  return {
    request,
    params: { academyId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/academias/:academyId",
  };
}

export function reportRouteArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/finanzas",
  };
}

export function paymentCreateRouteArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/pagos/nuevo",
  };
}

// fallow-ignore-next-line code-duplication
function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  return setCookie.split(";")[0] ?? "";
}
