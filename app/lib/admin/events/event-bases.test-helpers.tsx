import { and, eq, isNull } from "drizzle-orm";
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
import { events, prices, schedules, scheduleCapacities } from "@/db/schema";
import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import { requireAdminPanelUser } from "@/lib/auth/internal-navigation.server";
import type { GroupType } from "@/lib/events/group-types";
import { createModality } from "@/lib/modalities/repository.server";
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

export { createSignedInRequest, expectThrownResponse };

type ModalityRow = typeof modalities.$inferSelect;
type SubmodalityRow = typeof submodalities.$inferSelect;
type CategoryRow = Omit<typeof categories.$inferSelect, "experienceLevels"> & {
  modalityIds: string[];
  experienceLevels: string[];
};
type ScheduleCapacityRow = typeof scheduleCapacities.$inferSelect;

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

type ScheduleCapacityDraft = {
  id?: string;
  groupType: string;
  capacity: string;
};

type PriceDraft = {
  amount: string;
  groupType: string;
  isSpecialPrice?: string;
  name: string;
  paymentDeadline: string;
  scheduleId: string;
};

type ScheduleDraft = {
  name: string;
  scheduledDate: string;
  startTime: string;
  totalCapacity: string;
  modalityIds: string[];
  scheduleCapacities?: ScheduleCapacityDraft[];
};

type SignedInAdminRequestInput = Parameters<typeof createSignedInRequest>[0];

export async function createEventScheduleAdminFixture(
  modalityNames: string[] = ["Jazz", "Danzas urbanas"],
) {
  const event = await createSavedEvent("Regional 2026");
  const createdModalities: ModalityRow[] = await Promise.all(
    modalityNames.map(async (name) => {
      const result = await createModality(event.id, { name });

      if (!result.ok || !result.record || !("eventId" in result.record)) {
        throw new Error("Expected schedule modality fixture to be created.");
      }

      return result.record;
    }),
  );

  return {
    event,
    modalities: createdModalities,
    modalityIds: createdModalities.map((modality) => modality.id),
  };
}

export async function createEventPriceAdminFixture() {
  const { event, modalities } = await createEventScheduleAdminFixture(["Jazz"]);
  const scheduleRequest = await createScheduleAdminRequest({
    email: "admin.precio.cronograma.fixture@example.com",
    role: "admin",
    requestUrl: `http://localhost/administracion/cronogramas?evento=${event.id}`,
    intent: "create-schedule",
    schedule: buildScheduleDraft({
      modalityIds: [modalities[0].id],
    }),
  });

  await expectThrownResponse(action(routeArgs(scheduleRequest.request)), 302);

  const schedule = await findSavedScheduleByName("Sábado Mañana");

  if (!schedule) {
    throw new Error("Expected price schedule fixture to be created.");
  }

  return { event, modality: modalities[0], schedule };
}

export function buildScheduleDraft(
  overrides: Partial<ScheduleDraft> = {},
): ScheduleDraft {
  return {
    name: "Sábado mañana",
    scheduledDate: "2026-05-02",
    startTime: "09:00",
    totalCapacity: "24",
    modalityIds: [],
    scheduleCapacities: [],
    ...overrides,
  };
}

export function buildScheduleCapacityDraft(
  overrides: Partial<ScheduleCapacityDraft> = {},
): ScheduleCapacityDraft {
  return {
    groupType: "solo",
    capacity: "8",
    ...overrides,
  };
}

export function buildPriceDraft(
  overrides: Partial<PriceDraft> = {},
): PriceDraft {
  return {
    name: "Precio base",
    isSpecialPrice: "",
    groupType: "solo",
    amount: "12000",
    paymentDeadline: "2026-05-31",
    scheduleId: "",
    ...overrides,
  };
}

function formDataWithSchedule(
  intent: string,
  schedule: ScheduleDraft,
): FormData {
  return formData({
    intent,
    name: schedule.name,
    scheduledDate: schedule.scheduledDate,
    startTime: schedule.startTime,
    totalCapacity: schedule.totalCapacity,
    modalityIds: schedule.modalityIds,
    ...serializeScheduleCapacities(schedule.scheduleCapacities ?? []),
  });
}

function formDataWithScheduleCapacity(
  intent: string,
  scheduleId: string,
  capacity: ScheduleCapacityDraft,
): FormData {
  return formData({
    intent,
    scheduleId,
    id: capacity.id ?? "",
    groupType: capacity.groupType,
    capacity: capacity.capacity,
  });
}

export async function createScheduleAdminRequest(
  input: Omit<SignedInAdminRequestInput, "body"> & {
    intent: "create-schedule" | "update-schedule";
    schedule: ScheduleDraft;
    scheduleId?: string;
  },
) {
  const body =
    input.intent === "update-schedule"
      ? appendScheduleId(
          formDataWithSchedule(input.intent, input.schedule),
          input.scheduleId ?? "",
        )
      : formDataWithSchedule(input.intent, input.schedule);

  return createSignedInRequest({
    ...input,
    body,
  });
}

function formDataWithPrice(
  intent: "create-price" | "update-price",
  price: PriceDraft,
): FormData {
  return formData({
    intent,
    name: price.name,
    isSpecialPrice: price.isSpecialPrice ?? "",
    groupType: price.groupType,
    amount: price.amount,
    paymentDeadline: price.paymentDeadline,
    scheduleId: price.scheduleId,
  });
}

export async function createPriceAdminRequest(
  input: Omit<SignedInAdminRequestInput, "body"> & {
    intent: "create-price" | "update-price";
    price?: Partial<PriceDraft>;
    priceId?: string;
  },
) {
  const price = buildPriceDraft(input.price);
  const body = formDataWithPrice(input.intent, price);

  if (input.intent === "update-price") {
    body.set("id", input.priceId ?? "");
  }

  return createSignedInRequest({
    ...input,
    body,
  });
}

export async function createDeletePriceAdminRequest(
  input: Omit<SignedInAdminRequestInput, "body"> & {
    confirmDeletion?: string;
    priceId: string;
  },
) {
  const body = formData({
    intent: "delete-price",
    id: input.priceId,
  });

  if (input.confirmDeletion) {
    body.set("confirmDeletion", input.confirmDeletion);
  }

  return createSignedInRequest({
    ...input,
    body,
  });
}

export async function createScheduleCapacityAdminRequest(
  input: Omit<SignedInAdminRequestInput, "body"> & {
    intent:
      | "create-schedule-capacity"
      | "update-schedule-capacity"
      | "delete-schedule-capacity";
    scheduleId: string;
    scheduleCapacity?: ScheduleCapacityDraft;
    scheduleCapacityId?: string;
  },
) {
  const body =
    input.intent === "delete-schedule-capacity"
      ? formData({
          intent: input.intent,
          id: input.scheduleCapacityId ?? "",
        })
      : formDataWithScheduleCapacity(
          input.intent,
          input.scheduleId,
          input.scheduleCapacity ?? buildScheduleCapacityDraft(),
        );

  return createSignedInRequest({
    ...input,
    body,
  });
}

export async function createDeleteScheduleAdminRequest(
  input: Omit<SignedInAdminRequestInput, "body"> & { scheduleId: string },
) {
  return createSignedInRequest({
    ...input,
    body: formData({
      intent: "delete-schedule",
      id: input.scheduleId,
    }),
  });
}

export async function findSavedScheduleByName(name: string) {
  return db.query.schedules.findFirst({
    where: eq(schedules.name, name),
  });
}

export async function findSavedScheduleById(scheduleId: string) {
  return db.query.schedules.findFirst({
    where: eq(schedules.id, scheduleId),
  });
}

export async function findSavedPriceById(priceId: string) {
  return db.query.prices.findFirst({
    where: eq(prices.id, priceId),
  });
}

export async function findSavedPriceByScope(input: {
  groupType: GroupType;
  paymentDeadline: string;
  scheduleId: string | null;
}) {
  return db.query.prices.findFirst({
    where: and(
      eq(prices.groupType, input.groupType),
      eq(prices.paymentDeadline, input.paymentDeadline),
      input.scheduleId === null
        ? isNull(prices.scheduleId)
        : eq(prices.scheduleId, input.scheduleId),
    ),
  });
}

export async function listSavedScheduleCapacities(scheduleId: string) {
  return db.query.scheduleCapacities.findMany({
    where: eq(scheduleCapacities.scheduleId, scheduleId),
  });
}

export function expectScheduleCapacityBreakdown(
  entries: ScheduleCapacityRow[],
  expected: Array<Pick<ScheduleCapacityRow, "groupType" | "capacity">>,
) {
  expect(entries).toEqual(
    expect.arrayContaining(
      expected.map((entry) => expect.objectContaining(entry)),
    ),
  );
}

export function expectPriceSavedRedirect(response: Response) {
  expect(response.headers.get("location")).toMatch(
    /\/administracion\/precios\/[^?]+\?notificacion=precio-guardado/,
  );
}

export function expectPriceDeletedRedirect(response: Response) {
  expect(response.headers.get("location")).toBe(
    "/administracion/precios?notificacion=precio-eliminado",
  );
}

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

function serializeScheduleCapacities(
  capacities: ScheduleCapacityDraft[],
): Record<string, string> {
  return Object.fromEntries(
    capacities.flatMap((capacity, index) => {
      const prefix = `scheduleCapacities.${index}`;

      return [
        ...(capacity.id ? [[`${prefix}.id`, capacity.id] as const] : []),
        [`${prefix}.groupType`, capacity.groupType] as const,
        [`${prefix}.capacity`, capacity.capacity] as const,
      ];
    }),
  );
}

function appendScheduleId(form: FormData, scheduleId: string) {
  form.set("id", scheduleId);

  return form;
}
