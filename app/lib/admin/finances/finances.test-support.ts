import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryRouter,
  RouterContextProvider,
  RouterProvider,
} from "react-router";

import { registerAcademyEventPayment } from "@/features/admin/finances/academy-choreographies/payments.server";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSignedInRequest } from "@/lib/test-support/auth";
import {
  createChoreographyRecord,
  createEventCatalog,
} from "@/features/portal/choreographies/test-support/db";
import { readRequestedUrl } from "@/lib/shared/requested-url.server";
import {
  AcademyFinancesRouteView,
  loader as academyFinancesLoader,
} from "@/routes/administracion.finanzas_.$academyId";
import {
  FinancesListRouteView,
  loader as financeAccountsLoader,
} from "@/routes/administracion.finanzas";
import { date as choreographyDate } from "@/features/portal/choreographies/test-support/db";
import { renderInDataRouter } from "@/lib/test-support/data-router";
import { createSavedEvent } from "@/lib/test-support/events";

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
        element: createElement(AcademyFinancesRouteView, {
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
    renderInDataRouter(
      "/administracion/finanzas",
      createElement(FinancesListRouteView, {
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
    context: new RouterContextProvider(),
    url: readRequestedUrl(request),
    pattern: "/administracion/finanzas/:academyId",
  };
}

export function financesListRouteArgs(request: Request) {
  return {
    request,
    params: {},
    context: new RouterContextProvider(),
    url: readRequestedUrl(request),
    pattern: "/administracion/finanzas",
  };
}

export function paymentCreateRouteArgs(request: Request) {
  return {
    request,
    params: {},
    context: new RouterContextProvider(),
    url: readRequestedUrl(request),
    pattern: "/administracion/pagos/nuevo",
  };
}
