import type { EventStatus } from "@/lib/events/event-status";

export const eventStatusLabels: Record<EventStatus, string> = {
  "not-started": "No iniciado",
  "in-progress": "En curso",
  finished: "Finalizado",
};

/** What a shell reads where the `Estado del evento` goes, with no `Evento activo`. */
export const noActiveEventLabel = "Sin evento activo";
