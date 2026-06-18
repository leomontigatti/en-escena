import type { EventRegistrationMissingItem } from "@/lib/events/registration-readiness";
import type { PortalEventContext } from "@/lib/portal/event-context";

export type PortalChoreographyCreationBlockerCode =
  | "no-active-event"
  | "event-not-ready"
  | "registration-closed"
  | "no-active-dancers"
  | "no-selected-event";

export type PortalChoreographyCreationBlocker = {
  code: PortalChoreographyCreationBlockerCode;
  message: string;
  missingItems?: EventRegistrationMissingItem[];
};

export type PortalChoreographyCreationAvailability = {
  canCreate: boolean;
  blockers: PortalChoreographyCreationBlocker[];
};

export function getPortalChoreographyCreationAvailability(input: {
  activeDancerCount: number;
  eventContext: PortalEventContext;
}): PortalChoreographyCreationAvailability {
  const blockers: PortalChoreographyCreationBlocker[] = [];

  if (!input.eventContext.hasActiveEvent) {
    blockers.push({
      code: "no-active-event",
      message: "Todavía no hay un evento activo.",
    });
  }

  if (input.eventContext.activeEventRegistrationReadiness?.isReady === false) {
    blockers.push({
      code: "event-not-ready",
      message: "Faltan bases del evento antes de registrar coreografías.",
      missingItems:
        input.eventContext.activeEventRegistrationReadiness.missingItems,
    });
  }

  if (!input.eventContext.isRegistrationOpen) {
    blockers.push({
      code: "registration-closed",
      message: "El período de inscripción no está abierto.",
    });
  }

  if (input.activeDancerCount === 0) {
    blockers.push({
      code: "no-active-dancers",
      message:
        "Cargá al menos un bailarín activo antes de registrar coreografías.",
    });
  }

  if (input.eventContext.selectedEvent === null) {
    blockers.push({
      code: "no-selected-event",
      message: "No hay un evento seleccionado para registrar coreografías.",
    });
  }

  return {
    canCreate: blockers.length === 0,
    blockers,
  };
}
