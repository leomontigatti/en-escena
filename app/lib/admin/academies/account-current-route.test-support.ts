import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import { expect } from "vitest";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import {
  createChoreographyRecord,
  createEventCatalog,
} from "@/features/portal/choreographies/test-support/db";
import {
  AdministracionAcademiasRouteView,
  loader as academiesLoader,
} from "@/routes/administracion.academias";
import {
  action as accountCurrentAction,
  AdministracionAcademiaCuentaCorrienteRouteView,
  loader as accountCurrentLoader,
} from "@/routes/administracion.academias_.$academyId";
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
