import { events as eventsTable } from "@/db/schema";
import type {
  EventFormValues,
  FieldErrors,
} from "@/lib/admin/events/form-values";
import type {
  EventRegistrationMissingCode,
  EventRegistrationReadiness,
} from "@/lib/events/registration-readiness";

type EventRow = typeof eventsTable.$inferSelect;

export type AdministrativeEventDetailLoaderData = {
  event: EventRow;
  registrationReadiness: EventRegistrationReadiness;
};

export type AdministrativeEventDetailActionData = {
  status: "error";
  message: string;
  fieldErrors: FieldErrors;
  values: EventFormValues | null;
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
