function buildCreatePath(
  basePath: string,
  selectedEventId: string | null,
  createSegment = "nuevo",
) {
  return appendSelectedEventId(`${basePath}/${createSegment}`, selectedEventId);
}

function buildListPath(basePath: string, selectedEventId: string | null) {
  return appendSelectedEventId(basePath, selectedEventId);
}

function buildDetailPath(
  basePath: string,
  recordId: string,
  selectedEventId: string | null,
) {
  return appendSelectedEventId(`${basePath}/${recordId}`, selectedEventId);
}

function isDetailPath(basePath: string, requestUrl: string) {
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

export { buildDetailPath, buildCreatePath, buildListPath, isDetailPath };
