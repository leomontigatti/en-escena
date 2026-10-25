import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createMemoryRouter,
  RouterContextProvider,
  RouterProvider,
} from "react-router";

import { db } from "@/db";
import { choreographyDancers } from "@/db/schema";
import { spreadFromPool } from "@/lib/finances/allocation-pool.server";
import { choreographyTarget } from "@/lib/finances/allocation-target.server";
import { registerAcademyEventPayment } from "@/features/admin/finances/academy-choreographies/payments.server";
import { createAcademyUser } from "@/lib/test-support/academies";
import { createSignedInRequest } from "@/lib/test-support/auth";
import {
  createChoreographyRecord,
  createDancer,
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

/**
 * An academy with a `solo` inscription at the catalogue price (10000), the
 * given payments numbered from 1, and the given amount funded onto the
 * inscription through the pool (oldest payment first).
 */
export async function seedOwnerPoolForTest(input: {
  academyName: string;
  catalog?: Awaited<ReturnType<typeof createEventCatalog>>;
  event: Awaited<ReturnType<typeof createSavedEvent>>;
  fundedAmount: number;
  paymentAmounts: number[];
}) {
  const { academy, choreography } =
    await createAcademyFinanceChoreographyFixture({
      academyName: input.academyName,
      catalog: input.catalog,
      choreographyName: `${input.academyName} solo`,
      email: `${crypto.randomUUID()}@example.com`,
      event: input.event,
    });
  const academyId = academy.academy.id;
  const dancer = await createDancer(academyId, {
    firstName: "Ana",
    lastName: input.academyName,
  });
  const [inscription] = await db
    .insert(choreographyDancers)
    .values({
      ageAtEventStart: 14,
      choreographyId: choreography.id,
      dancerId: dancer.id,
    })
    .returning();

  for (const [index, amount] of input.paymentAmounts.entries()) {
    await registerPaymentForTest({
      academyId,
      amount: String(amount),
      eventId: input.event.id,
      paymentDate: `2026-04-0${index + 1}`,
    });
  }

  if (input.fundedAmount > 0) {
    const funded = await db.transaction((tx) =>
      spreadFromPool(tx, {
        academyId,
        amount: input.fundedAmount,
        eventId: input.event.id,
        target: choreographyTarget(inscription!.id),
      }),
    );
    if (!funded.ok) {
      throw new Error(`The test funding was refused: ${funded.message}`);
    }
  }

  return { academyId, inscriptionId: inscription!.id };
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
    pattern: "/administracion/movimientos/pagos/nuevo",
  };
}
