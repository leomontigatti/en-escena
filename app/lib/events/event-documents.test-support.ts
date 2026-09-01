import {
  eventDocumentKinds,
  type EventDocumentDownloadUrls,
  type EventDocumentKind,
} from "@/lib/events/event-documents";
import type {
  EventDocumentSummaries,
  EventDocumentSummary,
} from "@/lib/events/event-documents.server";

/** Every kind unavailable, which is what a view renders before any upload. */
export function eventDocumentDownloadUrls(
  overrides: Partial<Record<EventDocumentKind, string | null>> = {},
): EventDocumentDownloadUrls {
  return {
    ...(Object.fromEntries(
      eventDocumentKinds.map((kind) => [kind, null]),
    ) as EventDocumentDownloadUrls),
    ...overrides,
  };
}

/** The administration view of the same thing: no document uploaded yet. */
export function eventDocumentSummaries(
  overrides: Partial<Record<EventDocumentKind, EventDocumentSummary>> = {},
): EventDocumentSummaries {
  return {
    ...(Object.fromEntries(
      eventDocumentKinds.map((kind) => [kind, null]),
    ) as EventDocumentSummaries),
    ...overrides,
  };
}
