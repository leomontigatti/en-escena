const categoryRoutes = {
  detail: "/administracion/categorias",
  list: "/administracion/categorias",
  new: "/administracion/categorias/nueva",
} as const;

const modalityRoutes = {
  detail: "/administracion/modalidades",
  list: "/administracion/modalidades",
  new: "/administracion/modalidades/nueva",
} as const;

const scheduleRoutes = {
  detail: "/administracion/cronogramas",
  list: "/administracion/cronogramas",
  new: "/administracion/cronogramas/nuevo",
} as const;

const priceRoutes = {
  detail: "/administracion/precios",
  list: "/administracion/precios",
  new: "/administracion/precios/nuevo",
} as const;

export function buildCategoryCreatePath(selectedEventId: string | null) {
  return appendSelectedEventId(categoryRoutes.new, selectedEventId);
}

export function buildCategoriasListPath(selectedEventId: string | null) {
  return appendSelectedEventId(categoryRoutes.list, selectedEventId);
}

export function buildCategoryDetailPath(
  categoryId: string,
  selectedEventId: string | null,
) {
  return appendSelectedEventId(
    `${categoryRoutes.detail}/${categoryId}`,
    selectedEventId,
  );
}

export function isCategoryDetailPath(requestUrl: string) {
  return new RegExp(`^${categoryRoutes.detail}/[^/]+$`).test(
    new URL(requestUrl).pathname,
  );
}

export function buildModalidadesListPath(selectedEventId: string | null) {
  return appendSelectedEventId(modalityRoutes.list, selectedEventId);
}

export function buildNuevaModalidadPath(selectedEventId: string | null) {
  return appendSelectedEventId(modalityRoutes.new, selectedEventId);
}

export function buildModalidadDetallePath(
  modalityId: string,
  selectedEventId: string | null,
) {
  return appendSelectedEventId(
    `${modalityRoutes.detail}/${modalityId}`,
    selectedEventId,
  );
}

export function isModalityDetailPath(requestUrl: string) {
  return new RegExp(`^${modalityRoutes.detail}/[^/]+$`).test(
    new URL(requestUrl).pathname,
  );
}

export function buildSchedulesPath(selectedEventId: string | null) {
  return appendSelectedEventId(scheduleRoutes.list, selectedEventId);
}

export function buildNewSchedulePath(selectedEventId: string | null) {
  return appendSelectedEventId(scheduleRoutes.new, selectedEventId);
}

export function buildScheduleDetailPath(
  scheduleId: string,
  selectedEventId: string | null,
) {
  return appendSelectedEventId(
    `${scheduleRoutes.detail}/${scheduleId}`,
    selectedEventId,
  );
}

export function isScheduleDetailPath(requestUrl: string) {
  return new RegExp(`^${scheduleRoutes.detail}/[^/]+$`).test(
    new URL(requestUrl).pathname,
  );
}

export function buildPriceListPath(selectedEventId: string | null) {
  return appendSelectedEventId(priceRoutes.list, selectedEventId);
}

export function buildPriceCreatePath(selectedEventId: string | null) {
  return appendSelectedEventId(priceRoutes.new, selectedEventId);
}

export function buildPriceDetailPath(
  priceId: string,
  selectedEventId: string | null,
) {
  return appendSelectedEventId(
    `${priceRoutes.detail}/${priceId}`,
    selectedEventId,
  );
}

export function isPriceDetailPath(requestUrl: string) {
  return new RegExp(`^${priceRoutes.detail}/[^/]+$`).test(
    new URL(requestUrl).pathname,
  );
}

function appendSelectedEventId(
  pathname: string,
  _selectedEventId: string | null,
) {
  return pathname;
}
