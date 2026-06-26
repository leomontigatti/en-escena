import { eq } from "drizzle-orm";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { expect } from "vitest";

import {
  EventCategoryDetailRouteView,
  NewEventCategoryRouteView,
  EventCategoriesRouteView,
} from "@/components/admin/events/event-categories";
import {
  EventModalityDetailRouteView,
  EventModalitiesRouteView,
  NewEventModalityRouteView,
} from "@/components/admin/events/event-modalities";
import {
  EventPriceDetailRouteView,
  NewEventPriceRouteView,
  EventPricesRouteView,
} from "@/components/admin/events/event-prices";
import {
  EventSchedulesRouteView,
  EventScheduleDetailRouteView,
  NewEventScheduleRouteView,
} from "@/components/admin/events/event-schedules";
import { db } from "@/db";
import { user } from "@/db/schema";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";
import {
  action,
  type ActionData,
  type EventBasesLoaderData,
} from "@/lib/admin/events/bases-route.server";
import {
  createSavedEvent as createEventFixture,
  expectCreated,
} from "@/lib/events/bases-test-fixtures.server.db";
import { AdministracionRouteView } from "@/routes/administracion";
import { handle as bloquesHorariosHandle } from "@/routes/administracion.cronogramas";
import { handle as bloqueHorarioDetalleHandle } from "@/routes/administracion.cronogramas_.$scheduleId";
import { handle as bloqueHorarioNuevoHandle } from "@/routes/administracion.cronogramas_.nuevo";
import { handle as categoriasHandle } from "@/routes/administracion.categorias";
import { handle as categoriaDetalleHandle } from "@/routes/administracion.categorias_.$categoryId";
import { handle as categoriaNuevaHandle } from "@/routes/administracion.categorias_.nueva";
import { handle as modalidadesHandle } from "@/routes/administracion.modalidades";
import { handle as modalidadDetalleHandle } from "@/routes/administracion.modalidades_.$modalityId";
import { handle as modalidadNuevaHandle } from "@/routes/administracion.modalidades_.nueva";
import { handle as preciosHandle } from "@/routes/administracion.precios";
import { handle as precioDetalleHandle } from "@/routes/administracion.precios_.$priceId";
import { handle as precioNuevoHandle } from "@/routes/administracion.precios_.nuevo";

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
          [childRoute.id]: loaderData,
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
    element: createElement(EventCategoriesRouteView, { loaderData }),
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
    element: createElement(NewEventCategoryRouteView, {
      loaderData,
      actionData,
    }),
  });
}

export function renderCategoriaDetalleRoute(
  loaderData: EventBasesLoaderData,
  categoryId: string,
) {
  return renderRoute(loaderData, {
    id: "category-detail",
    path: "categorias/:categoryId",
    url: `/administracion/categorias/${categoryId}`,
    handle: categoriaDetalleHandle,
    element: createElement(EventCategoryDetailRouteView, {
      loaderData,
      categoryId,
    }),
  });
}

export function renderModalidadesRoute(loaderData: EventBasesLoaderData) {
  return renderRoute(loaderData, {
    id: "modalities",
    path: "modalidades",
    url: "/administracion/modalidades",
    handle: modalidadesHandle,
    element: createElement(EventModalitiesRouteView, {
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
    element: createElement(NewEventModalityRouteView, {
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
    element: createElement(EventModalityDetailRouteView, {
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
    element: createElement(EventSchedulesRouteView, {
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
    element: createElement(NewEventScheduleRouteView, {
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
    element: createElement(EventScheduleDetailRouteView, {
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
    element: createElement(EventPricesRouteView, { loaderData }),
  });
}

export function renderPrecioNuevoRoute(loaderData: EventBasesLoaderData) {
  return renderRoute(loaderData, {
    id: "price-new",
    path: "precios/nuevo",
    url: "/administracion/precios/nuevo",
    handle: precioNuevoHandle,
    element: createElement(NewEventPriceRouteView, { loaderData }),
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
    element: createElement(EventPriceDetailRouteView, {
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
    element: createElement(NewEventPriceRouteView, {
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
    element: createElement(EventScheduleDetailRouteView, {
      loaderData,
      scheduleId,
      actionData,
    }),
  });
}

export { action };
export { expectCreated };
