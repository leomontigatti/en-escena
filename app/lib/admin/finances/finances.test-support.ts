import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";

import { db } from "@/db";
import { academies, user } from "@/db/schema";
import { registerAcademyEventPayment } from "@/features/admin/finances/academy-choreographies/payments.server";
import {
  createAccessUser,
  createSessionRequestCookie,
} from "@/lib/auth/access-auth.test-support";
import { activateEvent, createEvent } from "@/lib/events/management.server";
import {
  createChoreographyRecord,
  createEventCatalog,
} from "@/features/portal/choreographies/test-support/db";
import {
  AdministracionFinanzasAcademiaRouteView,
  loader as academyFinancesLoader,
} from "@/routes/administracion.finanzas_.$academyId";
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
  const signUpResult = await createAccessUser({
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
        cookie: createSessionRequestCookie(signUpResult.headers),
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

export async function createAcademyFinanceChoreographyFixture(input: {
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
  await registerAcademyEventPayment({
    academyId: input.academyId,
    amount: Number(input.amount),
    eventId: input.eventId,
    internalNote: null,
    paymentDate: input.paymentDate,
    paymentMethod: "transferencia",
    reference: null,
  });
}

export function renderAcademyFinancesRoute(input: {
  loaderData: Awaited<ReturnType<typeof academyFinancesLoader>>;
}) {
  const routePath = `/administracion/finanzas/${input.loaderData.academy.id}`;
  const router = createMemoryRouter(
    [
      {
        path: "/administracion/finanzas/:academyId",
        element: createElement(AdministracionFinanzasAcademiaRouteView, {
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

export function academyFinancesUrl(academyId: string, eventId: string) {
  return `http://localhost/administracion/finanzas/${academyId}?evento=${eventId}`;
}

export function financesListUrl(eventId: string) {
  return `http://localhost/administracion/finanzas?evento=${eventId}`;
}

export function academyFinancesRouteArgs(request: Request, academyId: string) {
  return {
    request,
    params: { academyId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/finanzas/:academyId",
  };
}

export function financesListRouteArgs(request: Request) {
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
