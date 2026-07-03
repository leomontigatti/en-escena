import { eq } from "drizzle-orm";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub, redirect } from "react-router";
import { expect } from "vitest";

import { CategoryDetailView } from "@/features/admin/categories/detail/view";
import { CategoryCreateView } from "@/features/admin/categories/create/view";
import { CategoriesListView } from "@/features/admin/categories/list/view";
import { handleCategoryAction } from "@/features/admin/categories/action.server";
import type { CategoryDetailLoaderData } from "@/features/admin/categories/shared";
import { handleEventModalityAction } from "@/features/admin/modalities/action.server";
import { AdministrativeEventModalityCreateView } from "@/features/admin/modalities/create/view";
import { AdministrativeEventModalityDetailView } from "@/features/admin/modalities/detail/view";
import { AdministrativeEventModalitiesListView } from "@/features/admin/modalities/list/view";
import { handleEventPriceAction } from "@/features/admin/prices/action.server";
import { AdministrativeEventPriceCreateView } from "@/features/admin/prices/create/view";
import { AdministrativeEventPriceDetailView } from "@/features/admin/prices/detail/view";
import { AdministrativeEventPricesListView } from "@/features/admin/prices/list/view";
import { handleEventScheduleAction } from "@/features/admin/schedules/action.server";
import { AdministrativeEventScheduleCreateView } from "@/features/admin/schedules/create/view";
import { AdministrativeEventScheduleDetailView } from "@/features/admin/schedules/detail/view";
import { AdministrativeEventSchedulesListView } from "@/features/admin/schedules/list/view";
import { db } from "@/db";
import type { categories, modalities, submodalities } from "@/db/schema";
import { events, user } from "@/db/schema";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";
import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import {
  getEventBases,
  type PriceListItem,
  type ScheduleListItem,
} from "@/lib/events/bases.server";
import {
  createSavedEvent as createEventFixture,
  expectCreated,
  fixedExperienceLevel,
} from "@/lib/events/bases-test-fixtures.server.db";
import { AdministracionRouteView } from "@/routes/administracion";
import { handle as bloquesHorariosHandle } from "@/routes/administracion.cronogramas";
import { handle as bloqueHorarioDetalleHandle } from "@/routes/administracion.cronogramas_.$scheduleId";
import { handle as bloqueHorarioNuevoHandle } from "@/routes/administracion.cronogramas_.nuevo";
import { handle as categoriasHandle } from "../../../routes/administracion.categorias";
import { handle as categoriaDetalleHandle } from "../../../routes/administracion.categorias_.$categoryId";
import { handle as categoriaNuevaHandle } from "../../../routes/administracion.categorias_.nueva";
import { handle as modalidadesHandle } from "@/routes/administracion.modalidades";
import { handle as modalidadDetalleHandle } from "@/routes/administracion.modalidades_.$modalityId";
import { handle as modalidadNuevaHandle } from "@/routes/administracion.modalidades_.nueva";
import { handle as preciosHandle } from "@/routes/administracion.precios";
import { handle as precioDetalleHandle } from "@/routes/administracion.precios_.$priceId";
import { handle as precioNuevoHandle } from "@/routes/administracion.precios_.nuevo";

type ModalityRow = typeof modalities.$inferSelect;
type SubmodalityRow = typeof submodalities.$inferSelect;
type CategoryRow = Omit<typeof categories.$inferSelect, "experienceLevels"> & {
  modalityIds: string[];
  experienceLevels: string[];
};

export type EventBasesLoaderData = {
  selectedEventId: string | null;
  requiredDepositPercentage: number | null;
  modalities: ModalityRow[];
  submodalities: SubmodalityRow[];
  categories: CategoryRow[];
  schedules: ScheduleListItem[];
  prices: PriceListItem[];
};

export async function createSavedEvent(
  name: string,
  options: { activate?: boolean } = {},
) {
  const { activate = true } = options;

  return createEventFixture(name, { activate });
}

export function renderRoute(
  loaderData: EventBasesLoaderData,
  childRoute: AdminChildRouteFixture,
) {
  const RoutesStub = createRoutesStub([
    {
      id: "admin",
      path: "/administracion",
      Component: AdministracionRouteView,
      children: [
        {
          id: childRoute.id,
          path: childRoute.path,
          Component: () => childRoute.element,
          handle: childRoute.handle,
        },
      ],
    },
  ]);

  return renderToStaticMarkup(
    createElement(RoutesStub, {
      initialEntries: [childRoute.url],
      hydrationData: {
        loaderData: {
          admin: adminLoaderData(loaderData),
          [childRoute.id]: childRoute.routeLoaderData ?? loaderData,
        },
      },
    }),
  );
}

type AdminChildRouteFixture = {
  element: ReactElement;
  handle?: unknown;
  id: string;
  path: string;
  routeLoaderData?: unknown;
  url: string;
};

function adminLoaderData(loaderData: EventBasesLoaderData) {
  return {
    email: "admin@example.com",
    events: [{ active: true, id: "event_1", name: "Evento 2026" }],
    selectedEventId: loaderData.selectedEventId,
  };
}

export function renderCategoriasRoute(loaderData: EventBasesLoaderData) {
  return renderRoute(loaderData, {
    id: "categories",
    path: "categorias",
    url: "/administracion/categorias",
    handle: categoriasHandle,
    element: createElement(CategoriesListView, { loaderData }),
  });
}

export function renderCategoriaNuevaRoute(
  loaderData: EventBasesLoaderData,
  actionData?: ActionData,
) {
  return renderRoute(loaderData, {
    id: "category-new",
    path: "categorias/nueva",
    url: "/administracion/categorias/nueva",
    handle: categoriaNuevaHandle,
    element: createElement(CategoryCreateView, {
      loaderData,
      actionData,
    }),
  });
}

export function renderCategoriaDetalleRoute(
  loaderData: EventBasesLoaderData,
  categoryId: string,
) {
  const routeLoaderData = buildCategoryDetailLoaderData(loaderData, categoryId);

  return renderRoute(loaderData, {
    id: "category-detail",
    path: "categorias/:categoryId",
    url: `/administracion/categorias/${categoryId}`,
    handle: categoriaDetalleHandle,
    element: createElement(CategoryDetailView, {
      loaderData: routeLoaderData,
    }),
    routeLoaderData,
  });
}

function buildCategoryDetailLoaderData(
  loaderData: EventBasesLoaderData,
  categoryId: string,
): CategoryDetailLoaderData {
  return {
    selectedEventId: loaderData.selectedEventId,
    category:
      loaderData.categories.find((category) => category.id === categoryId) ??
      null,
    modalities: loaderData.modalities,
  };
}

export function renderModalidadesRoute(loaderData: EventBasesLoaderData) {
  return renderRoute(loaderData, {
    id: "modalities",
    path: "modalidades",
    url: "/administracion/modalidades",
    handle: modalidadesHandle,
    element: createElement(AdministrativeEventModalitiesListView, {
      loaderData,
    }),
  });
}

export function renderNuevaModalidadRoute(
  loaderData: EventBasesLoaderData,
  actionData?: ActionData,
) {
  return renderRoute(loaderData, {
    id: "modality-new",
    path: "modalidades/nueva",
    url: "/administracion/modalidades/nueva",
    handle: modalidadNuevaHandle,
    element: createElement(AdministrativeEventModalityCreateView, {
      loaderData,
      actionData,
    }),
  });
}

export function renderModalidadDetalleRoute(
  loaderData: EventBasesLoaderData,
  modalityId: string,
  actionData?: ActionData,
) {
  return renderRoute(loaderData, {
    id: "modality-detail",
    path: "modalidades/:modalityId",
    url: `/administracion/modalidades/${modalityId}`,
    handle: modalidadDetalleHandle,
    element: createElement(AdministrativeEventModalityDetailView, {
      loaderData,
      modalityId,
      actionData,
    }),
  });
}

export function renderBloquesHorariosRoute(loaderData: EventBasesLoaderData) {
  return renderRoute(loaderData, {
    id: "schedules",
    path: "cronogramas",
    url: "/administracion/cronogramas",
    handle: bloquesHorariosHandle,
    element: createElement(AdministrativeEventSchedulesListView, {
      loaderData,
    }),
  });
}

export function renderNuevoBloqueHorarioRoute(
  loaderData: EventBasesLoaderData,
) {
  return renderRoute(loaderData, {
    id: "schedule-new",
    path: "cronogramas/nuevo",
    url: "/administracion/cronogramas/nuevo",
    handle: bloqueHorarioNuevoHandle,
    element: createElement(AdministrativeEventScheduleCreateView, {
      loaderData,
    }),
  });
}

export function renderBloqueHorarioDetailRoute(
  loaderData: EventBasesLoaderData,
  scheduleId: string,
  actionData?: ActionData,
) {
  return renderRoute(loaderData, {
    id: "schedule-detail",
    path: "cronogramas/:scheduleId",
    url: `/administracion/cronogramas/${scheduleId}`,
    handle: bloqueHorarioDetalleHandle,
    element: createElement(AdministrativeEventScheduleDetailView, {
      loaderData,
      scheduleId,
      actionData,
    }),
  });
}

export function renderPreciosRoute(loaderData: EventBasesLoaderData) {
  return renderRoute(loaderData, {
    id: "prices",
    path: "precios",
    url: "/administracion/precios",
    handle: preciosHandle,
    element: createElement(AdministrativeEventPricesListView, { loaderData }),
  });
}

export function renderPrecioNuevoRoute(loaderData: EventBasesLoaderData) {
  return renderRoute(loaderData, {
    id: "price-new",
    path: "precios/nuevo",
    url: "/administracion/precios/nuevo",
    handle: precioNuevoHandle,
    element: createElement(AdministrativeEventPriceCreateView, { loaderData }),
  });
}

export function renderPrecioDetalleRoute(
  loaderData: EventBasesLoaderData,
  priceId: string,
) {
  return renderRoute(loaderData, {
    id: "price-detail",
    path: "precios/:priceId",
    url: `/administracion/precios/${priceId}`,
    handle: precioDetalleHandle,
    element: createElement(AdministrativeEventPriceDetailView, {
      loaderData,
      priceId,
    }),
  });
}

export async function createSignedInRequest(input: {
  email: string;
  role: "academy" | "admin" | "auditor" | "judge";
  requestUrl: string;
  body?: FormData;
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
    request: new Request(input.requestUrl, {
      method: input.body ? "POST" : "GET",
      body: input.body,
      headers: {
        cookie: createRequestCookie(signUpResult.headers),
      },
    }),
  };
}

export function formData(input: Record<string, string | string[]>) {
  const form = new FormData();

  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        form.append(key, item);
      }
      continue;
    }

    form.set(key, value);
  }

  return form;
}

export function routeArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/eventos",
  };
}

export async function loader({ request }: { request: Request }) {
  await requireAdminPanelUser(request);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const selectedEventId = eventContext.selectedEventId;
  const [selectedEvent, eventBases] = selectedEventId
    ? await Promise.all([
        db.query.events.findFirst({
          columns: { requiredDepositPercentage: true },
          where: eq(events.id, selectedEventId),
        }),
        getEventBases(selectedEventId),
      ])
    : [
        null,
        {
          categories: [],
          modalities: [],
          submodalities: [],
          schedules: [],
          prices: [],
        },
      ];

  return {
    selectedEventId,
    requiredDepositPercentage: selectedEvent?.requiredDepositPercentage ?? null,
    ...eventBases,
  } satisfies EventBasesLoaderData;
}

export async function action({ request }: { request: Request }) {
  const pathname = new URL(request.url).pathname;

  if (pathname.startsWith("/administracion/categorias")) {
    return handleCategoryAction(request);
  }

  if (pathname.startsWith("/administracion/modalidades")) {
    return handleEventModalityAction(request);
  }

  if (pathname.startsWith("/administracion/cronogramas")) {
    return handleEventScheduleAction(request);
  }

  if (pathname.startsWith("/administracion/precios")) {
    return handleEventPriceAction(request);
  }

  const intent = await readIntent(request);

  if (isCategoryIntent(intent)) {
    return handleCategoryAction(request);
  }

  if (isModalityIntent(intent)) {
    return handleEventModalityAction(request);
  }

  if (isScheduleIntent(intent)) {
    return handleEventScheduleAction(request);
  }

  return handleEventPriceAction(request);
}

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  return setCookie.split(";")[0] ?? "";
}

export async function expectThrownResponse(
  resultPromise: Promise<unknown>,
  status: number,
) {
  try {
    await resultPromise;
  } catch (error) {
    expect(error).toBeInstanceOf(Response);
    expect((error as Response).status).toBe(status);
    return error as Response;
  }

  throw new Error("Expected a response to be thrown.");
}

export function renderPriceNewErrorRoute(
  loaderData: EventBasesLoaderData,
  actionData: ActionData,
) {
  return renderRoute(loaderData, {
    id: "price-new-error",
    path: "precios/nuevo",
    url: "/administracion/precios/nuevo",
    handle: precioNuevoHandle,
    element: createElement(AdministrativeEventPriceCreateView, {
      loaderData,
      actionData,
    }),
  });
}

export function renderScheduleDetailErrorRoute(
  loaderData: EventBasesLoaderData,
  scheduleId: string,
  actionData: ActionData,
) {
  return renderRoute(loaderData, {
    id: "schedule-detail-error",
    path: "cronogramas/:scheduleId",
    url: `/administracion/cronogramas/${scheduleId}`,
    handle: bloqueHorarioDetalleHandle,
    element: createElement(AdministrativeEventScheduleDetailView, {
      loaderData,
      scheduleId,
      actionData,
    }),
  });
}

export { expectCreated };
export { fixedExperienceLevel };

async function readIntent(request: Request) {
  const formData = await request.clone().formData();

  return String(formData.get("intent") ?? "");
}

function isCategoryIntent(intent: string) {
  return intent.endsWith("-category");
}

function isModalityIntent(intent: string) {
  return intent.endsWith("-modality") || intent.endsWith("-submodality");
}

function isScheduleIntent(intent: string) {
  return intent.endsWith("-schedule") || intent.endsWith("-schedule-capacity");
}
