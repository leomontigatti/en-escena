import type { events as eventsTable } from "@/db/schema";
import type {
  EventFormValues,
  FieldErrors,
} from "@/lib/admin/events/form-values";
import type { EventDocumentKind } from "@/lib/events/event-documents";
import type { EventDocumentSummaries } from "@/lib/events/event-documents.server";
import type {
  EventRegistrationMissingCode,
  EventRegistrationReadiness,
} from "@/lib/events/registration-readiness";

type EventRow = typeof eventsTable.$inferSelect;

/**
 * The documents ride along with the event form instead of owning a submission
 * each: one `update` posts the name, the dates and the three PDFs together, so
 * the card has a single "Guardar". These names are what tie the two halves.
 *
 * Absent marker included on purpose. A body that carries no `documentsPresent`
 * is not "every document was removed" — it is a submission that never had the
 * fields, and the action leaves the documents alone rather than deleting three
 * PDFs because a field was missing.
 */
export const eventDocumentsPresentField = "documentsPresent";

/** The file input for one document. Empty on every save that does not replace it. */
export function eventDocumentFileField(kind: EventDocumentKind) {
  return `documentFile_${kind}`;
}

/**
 * Whether the document that already exists is still wanted. The upload field
 * writes its "storage key" here, so its own remove button empties it and the
 * save deletes the document — the client never learns the real storage key.
 */
export function eventDocumentKeptField(kind: EventDocumentKind) {
  return `documentKept_${kind}`;
}

export const keptEventDocumentValue = "kept";

export type EventDetailLoaderData = {
  documents: EventDocumentSummaries;
  event: EventRow;
  registrationReadiness: EventRegistrationReadiness;
};

export type EventDetailActionData =
  | {
      status: "error";
      message: string;
      fieldErrors: FieldErrors;
      values: EventFormValues | null;
    }
  | {
      status: "success";
      message: string;
    };

export function getMissingItemAdminPath(code: EventRegistrationMissingCode) {
  switch (code) {
    case "modalities":
      return "/administracion/modalidades";
    case "categories":
      return "/administracion/categorias";
    case "schedules":
    case "schedule-entries":
    case "schedule-compatibility":
      return "/administracion/cronogramas";
    case "prices":
    case "price-coverage":
      return "/administracion/precios";
  }
}

export function getMissingItemLinkLabel(code: EventRegistrationMissingCode) {
  switch (code) {
    case "modalities":
      return "modalidades";
    case "categories":
      return "categorías";
    case "schedules":
    case "schedule-entries":
    case "schedule-compatibility":
      return "cronogramas";
    case "prices":
    case "price-coverage":
      return "precios";
  }
}

export function getMissingItemSummary(code: EventRegistrationMissingCode) {
  switch (code) {
    case "modalities":
      return "Falta cargar modalidades.";
    case "categories":
      return "Falta cargar categorías.";
    case "schedules":
      return "Falta cargar cronogramas.";
    case "schedule-entries":
      return "Falta cargar cupos de cronograma.";
    case "prices":
      return "Falta cargar precios.";
    case "schedule-compatibility":
      return "Existen categorías sin un cupo de cronograma compatible.";
    case "price-coverage":
      return "Existen combinaciones sin un precio aplicable.";
  }
}

export function eventActionPath(eventId: string) {
  return `/administracion/eventos/${eventId}`;
}
