import type { EventStatus } from "@/lib/events/event-status";

export type EventOption = {
  id: string;
  name: string;
  active: boolean;
};

/**
 * The shell's own context: the `Evento activo` and its `Estado del evento`,
 * which exists only when there is an active event.
 */
export type AdminShellEventContext =
  | { activeEvent: null }
  | {
      activeEvent: { id: string; name: string };
      eventStatus: EventStatus;
    };
