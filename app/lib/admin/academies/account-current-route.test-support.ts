import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { expect } from "vitest";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";
import { activateEvent, createEvent } from "@/lib/events/management.server";
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
  AdministracionPagosNuevoRouteView,
  action as paymentCreateAction,
  loader as paymentCreateLoader,
} from "@/routes/administracion.pagos_.nuevo";
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

export async function buildPaymentRequest(input: {
  amount: string;
  internalNote?: string;
  paymentDate: string;
  paymentMethod: string;
  reference?: string;
  requestUrl: string;
  role: "admin" | "auditor";
}) {
  const signedIn = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role: input.role,
    requestUrl: input.requestUrl,
  });
  const formData = new FormData();
  formData.set("intent", "register-payment");
  formData.set("amount", input.amount);
  formData.set("paymentDate", input.paymentDate);
  formData.set("paymentMethod", input.paymentMethod);
  formData.set("reference", input.reference ?? "");
  formData.set("internalNote", input.internalNote ?? "");

  return {
    request: new Request(input.requestUrl, {
      method: "POST",
      body: formData,
      headers: {
        cookie: signedIn.request.headers.get("cookie") ?? "",
      },
    }),
  };
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
  const signedIn = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role: input.role,
    requestUrl: input.requestUrl,
  });
  const formData = new FormData();
  formData.set("intent", "create-payment");
  formData.set("academyId", input.academyId);
  formData.set("amount", input.amount);
  formData.set("paymentDate", input.paymentDate);
  formData.set("paymentMethod", input.paymentMethod);
  formData.set("reference", input.reference ?? "");
  formData.set("internalNote", input.internalNote ?? "");

  return {
    request: new Request(input.requestUrl, {
      method: "POST",
      body: formData,
      headers: {
        cookie: signedIn.request.headers.get("cookie") ?? "",
      },
    }),
  };
}

export async function buildDepositInvoiceRequest(input: {
  choreographyIds: string[];
  issueDate: string;
  requestUrl: string;
  role: "admin" | "auditor";
}) {
  const signedIn = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role: input.role,
    requestUrl: input.requestUrl,
  });
  const formData = new FormData();
  formData.set("intent", "issue-deposit-invoices");
  formData.set("issueDate", input.issueDate);

  for (const choreographyId of input.choreographyIds) {
    formData.append("choreographyIds", choreographyId);
  }

  return {
    request: new Request(input.requestUrl, {
      method: "POST",
      body: formData,
      headers: {
        cookie: signedIn.request.headers.get("cookie") ?? "",
      },
    }),
  };
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
  const signedIn = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role: input.role,
    requestUrl: input.requestUrl,
  });
  const formData = new FormData();
  formData.set("intent", "preview-balance-invoice");
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

  return {
    request: new Request(input.requestUrl, {
      method: "POST",
      body: formData,
      headers: {
        cookie: signedIn.request.headers.get("cookie") ?? "",
      },
    }),
  };
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
  const signedIn = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role: input.role,
    requestUrl: input.requestUrl,
  });
  const formData = new FormData();
  formData.set("intent", "issue-balance-invoice");
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

  return {
    request: new Request(input.requestUrl, {
      method: "POST",
      body: formData,
      headers: {
        cookie: signedIn.request.headers.get("cookie") ?? "",
      },
    }),
  };
}

export async function buildPaymentImputationRequest(input: {
  amount: string;
  imputationDate: string;
  invoiceId: string;
  paymentId: string;
  requestUrl: string;
  role: "admin" | "auditor";
}) {
  const signedIn = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role: input.role,
    requestUrl: input.requestUrl,
  });
  const formData = new FormData();
  formData.set("intent", "impute-payment");
  formData.set("amount", input.amount);
  formData.set("imputationDate", input.imputationDate);
  formData.set("invoiceId", input.invoiceId);
  formData.set("paymentId", input.paymentId);

  return {
    request: new Request(input.requestUrl, {
      method: "POST",
      body: formData,
      headers: {
        cookie: signedIn.request.headers.get("cookie") ?? "",
      },
    }),
  };
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
  const signedIn = await createSignedInRequest({
    email: `${crypto.randomUUID()}@example.com`,
    role: input.role,
    requestUrl: input.requestUrl,
  });
  const formData = new FormData();
  formData.set("intent", input.intent);
  formData.set(input.fieldName, input.fieldValue);
  formData.set("reason", input.reason);

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
  const { request } = await buildDepositInvoiceRequest({
    choreographyIds: input.choreographyIds,
    issueDate: input.issueDate,
    requestUrl: accountCurrentUrl(input.academyId, input.eventId),
    role: "admin",
  });

  await expect(
    accountCurrentAction(detailActionArgs(request, input.academyId)),
  ).rejects.toMatchObject({
    status: 302,
  });
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
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: [
          `/administracion/academias/${input.loaderData.academy.id}`,
        ],
      },
      createElement(AdministracionAcademiaCuentaCorrienteRouteView, {
        loaderData: input.loaderData,
      }),
    ),
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

export function renderPaymentCreateRoute(input: {
  actionData?: Awaited<ReturnType<typeof paymentCreateAction>>;
  loaderData: Awaited<ReturnType<typeof paymentCreateLoader>>;
}) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: ["/administracion/pagos/nuevo"],
      },
      createElement(AdministracionPagosNuevoRouteView, {
        actionData: input.actionData,
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
