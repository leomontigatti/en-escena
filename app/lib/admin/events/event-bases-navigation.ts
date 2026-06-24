const categoryBasePath = "/administracion/categorias";
const modalityBasePath = "/administracion/modalidades";
const scheduleBasePath = "/administracion/cronogramas";
const priceBasePath = "/administracion/precios";

export function buildCategoryCreatePath(selectedEventId: string | null) {
  return appendSelectedEventId(`${categoryBasePath}/nueva`, selectedEventId);
}

export function buildCategoriasListPath(selectedEventId: string | null) {
  return appendSelectedEventId(categoryBasePath, selectedEventId);
}

export function buildCategoryDetailPath(
  categoryId: string,
  selectedEventId: string | null,
) {
  return buildEventBaseDetailPath(
    categoryBasePath,
    categoryId,
    selectedEventId,
  );
}

export function isCategoryDetailPath(requestUrl: string) {
  return isEventBaseDetailPath(categoryBasePath, requestUrl);
}

export function buildModalidadesListPath(selectedEventId: string | null) {
  return appendSelectedEventId(modalityBasePath, selectedEventId);
}

export function buildNuevaModalidadPath(selectedEventId: string | null) {
  return appendSelectedEventId(`${modalityBasePath}/nueva`, selectedEventId);
}

export function buildModalidadDetallePath(
  modalityId: string,
  selectedEventId: string | null,
) {
  return buildEventBaseDetailPath(
    modalityBasePath,
    modalityId,
    selectedEventId,
  );
}

export function isModalityDetailPath(requestUrl: string) {
  return isEventBaseDetailPath(modalityBasePath, requestUrl);
}

export function buildSchedulesPath(selectedEventId: string | null) {
  return appendSelectedEventId(scheduleBasePath, selectedEventId);
}

export function buildNewSchedulePath(selectedEventId: string | null) {
  return appendSelectedEventId(`${scheduleBasePath}/nuevo`, selectedEventId);
}

export function buildScheduleDetailPath(
  scheduleId: string,
  selectedEventId: string | null,
) {
  return buildEventBaseDetailPath(
    scheduleBasePath,
    scheduleId,
    selectedEventId,
  );
}

export function isScheduleDetailPath(requestUrl: string) {
  return isEventBaseDetailPath(scheduleBasePath, requestUrl);
}

export function buildPriceListPath(selectedEventId: string | null) {
  return appendSelectedEventId(priceBasePath, selectedEventId);
}

export function buildPriceCreatePath(selectedEventId: string | null) {
  return appendSelectedEventId(`${priceBasePath}/nuevo`, selectedEventId);
}

export function buildPriceDetailPath(
  priceId: string,
  selectedEventId: string | null,
) {
  return buildEventBaseDetailPath(priceBasePath, priceId, selectedEventId);
}

export function isPriceDetailPath(requestUrl: string) {
  return isEventBaseDetailPath(priceBasePath, requestUrl);
}

function buildEventBaseDetailPath(
  basePath: string,
  recordId: string,
  selectedEventId: string | null,
) {
  return appendSelectedEventId(`${basePath}/${recordId}`, selectedEventId);
}

function isEventBaseDetailPath(basePath: string, requestUrl: string) {
  const detailPrefix = `${basePath}/`;
  const pathname = new URL(requestUrl).pathname;

  if (!pathname.startsWith(detailPrefix)) {
    return false;
  }

  const detailSegment = pathname.slice(detailPrefix.length);

  return detailSegment.length > 0 && !detailSegment.includes("/");
}

function appendSelectedEventId(
  pathname: string,
  _selectedEventId: string | null,
) {
  return pathname;
}
